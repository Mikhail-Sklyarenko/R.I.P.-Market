import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { ExtensionFlowLogCode, OpsAlertId } from './extension-flow-log-codes';
import {
  antiFraudRuleThresholds,
  isExtensionAntiFraudEnabled,
} from './extension-flow-observability.config';
import { ExtensionFlowMetricsService } from './extension-flow-metrics.service';
import { ObservabilityAlertService } from './observability-alert.service';
import { getAuditContext } from './audit-context';

export type AntiFraudRuleId =
  | 'VELOCITY_DISPUTES'
  | 'EXT_AUTH_BURST'
  | 'TASK_FAILURE_BURST'
  | 'RAPID_HANDSHAKE';

export type AntiFraudCheckResult = {
  triggered: boolean;
  ruleId?: AntiFraudRuleId;
  action: 'NONE' | 'LOG' | 'ALERT' | 'BLOCK';
  detail?: Record<string, unknown>;
};

type SlidingWindow = {
  timestamps: number[];
};

const WINDOW_MS: Record<AntiFraudRuleId, number> = {
  VELOCITY_DISPUTES: 60 * 60 * 1000,
  EXT_AUTH_BURST: 5 * 60 * 1000,
  TASK_FAILURE_BURST: 10 * 60 * 1000,
  RAPID_HANDSHAKE: 60 * 60 * 1000,
};

@Injectable()
export class AntiFraudRuleService {
  private readonly logger = new Logger(AntiFraudRuleService.name);
  private readonly windows = new Map<string, SlidingWindow>();

  constructor(
    private readonly metrics: ExtensionFlowMetricsService,
    private readonly alerts: ObservabilityAlertService,
  ) {}

  recordDisputeOpened(userId: string, orderId: string): AntiFraudCheckResult {
    return this.evaluate('VELOCITY_DISPUTES', `dispute:${userId}`, {
      userId,
      orderId,
      threshold: antiFraudRuleThresholds().disputesPerUserPerHour,
    });
  }

  recordAuthFailure(userId: string, code: string): AntiFraudCheckResult {
    const result = this.evaluate('EXT_AUTH_BURST', `auth:${userId}`, {
      userId,
      code,
      threshold: antiFraudRuleThresholds().authFailuresPerUserPer5m,
    });
    if (result.triggered && result.action === 'BLOCK') {
      throw new AppException(
        ErrorCode.EXTENSION_ANTI_FRAUD_BLOCKED,
        'Extension access temporarily blocked due to suspicious activity',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result;
  }

  recordTaskFailure(sellerId: string, orderId: string): AntiFraudCheckResult {
    return this.evaluate('TASK_FAILURE_BURST', `task-fail:${sellerId}`, {
      sellerId,
      orderId,
      threshold: antiFraudRuleThresholds().taskFailuresPerSellerPer10m,
    });
  }

  recordHandshake(userId: string): AntiFraudCheckResult {
    const result = this.evaluate('RAPID_HANDSHAKE', `handshake:${userId}`, {
      userId,
      threshold: antiFraudRuleThresholds().handshakesPerUserPerHour,
    });
    if (result.triggered && result.action === 'BLOCK') {
      throw new AppException(
        ErrorCode.EXTENSION_ANTI_FRAUD_BLOCKED,
        'Too many extension handshakes; try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result;
  }

  private evaluate(
    ruleId: AntiFraudRuleId,
    key: string,
    detail: Record<string, unknown>,
  ): AntiFraudCheckResult {
    if (!isExtensionAntiFraudEnabled()) {
      return { triggered: false, action: 'NONE' };
    }

    const count = this.increment(key, WINDOW_MS[ruleId]);
    const threshold = detail.threshold as number;
    if (count < threshold) {
      return { triggered: false, action: 'NONE' };
    }

    const action =
      ruleId === 'EXT_AUTH_BURST' || ruleId === 'RAPID_HANDSHAKE'
        ? 'BLOCK'
        : 'ALERT';

    const { requestId } = getAuditContext();
    this.logger.warn(
      JSON.stringify({
        event: ExtensionFlowLogCode.ANTI_FRAUD_TRIGGERED,
        logCode: ExtensionFlowLogCode.ANTI_FRAUD_TRIGGERED,
        trace: 'extension-flow',
        correlationId: requestId,
        requestId,
        alert: true,
        ruleId,
        count,
        threshold,
        ...detail,
      }),
    );

    void this.alerts.maybeFireAlert({
      alertId: OpsAlertId.ANTI_FRAUD_VELOCITY,
      shouldFire: true,
      detail: { ruleId, count, threshold, ...detail },
      force: true,
    });

    return {
      triggered: true,
      ruleId,
      action,
      detail: { count, threshold, ...detail },
    };
  }

  private increment(key: string, windowMs: number): number {
    const now = Date.now();
    const entry = this.windows.get(key) ?? { timestamps: [] };
    const cutoff = now - windowMs;
    entry.timestamps = entry.timestamps.filter((at) => at >= cutoff);
    entry.timestamps.push(now);
    this.windows.set(key, entry);
    return entry.timestamps.length;
  }
}
