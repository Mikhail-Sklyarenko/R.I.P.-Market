import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getAuditContext } from './audit-context';
import {
  ExtensionFlowLogCode,
  OpsAlertId,
  type OpsAlertIdType,
} from './extension-flow-log-codes';
import {
  extensionFlowAlertThresholds,
  isExtensionFlowObservabilityEnabled,
} from './extension-flow-observability.config';
import { ExtensionFlowMetricsService } from './extension-flow-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';

type ActiveAlert = {
  alertId: OpsAlertIdType;
  firedAt: string;
  detail: Record<string, unknown>;
};

const ALERT_DEDUP_MS = 5 * 60 * 1000;

@Injectable()
export class ObservabilityAlertService implements OnModuleInit {
  private readonly logger = new Logger(ObservabilityAlertService.name);
  private readonly activeAlerts = new Map<string, ActiveAlert>();
  private readonly lastFiredAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ExtensionFlowMetricsService,
  ) {}

  onModuleInit(): void {
    this.metrics.registerAlertEvaluator(() => {
      void this.evaluateThresholds();
    });
  }

  snapshotActiveAlerts(): ActiveAlert[] {
    return [...this.activeAlerts.values()];
  }

  async evaluateThresholds(): Promise<void> {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }

    const thresholds = extensionFlowAlertThresholds();
    const kpis = this.metrics.snapshotKpis();
    const window5m = 5 * 60 * 1000;

    await this.maybeFireAlert({
      alertId: OpsAlertId.TASK_FAILURE_SPIKE,
      shouldFire:
        this.metrics.countRolling('task_failed', window5m) >=
        thresholds.taskFailureSpike5m,
      detail: {
        count_5m: this.metrics.countRolling('task_failed', window5m),
        threshold: thresholds.taskFailureSpike5m,
      },
    });

    await this.maybeFireAlert({
      alertId: OpsAlertId.EXTENSION_AUTH_ANOMALY,
      shouldFire:
        this.metrics.countRolling('auth_error', window5m) >=
        thresholds.authErrorSpike5m,
      detail: {
        count_5m: this.metrics.countRolling('auth_error', window5m),
        threshold: thresholds.authErrorSpike5m,
      },
    });

    await this.maybeFireAlert({
      alertId: OpsAlertId.VERIFY_MISMATCH_SPIKE,
      shouldFire:
        this.metrics.countRolling('verify_mismatch', window5m) >=
        thresholds.verifyMismatchSpike5m,
      detail: {
        count_5m: this.metrics.countRolling('verify_mismatch', window5m),
        threshold: thresholds.verifyMismatchSpike5m,
      },
    });

    const started = kpis.counters.extension_flow_orders_started_total;
    const disputeRate = kpis.rates.extension_flow_dispute_rate_pct;
    await this.maybeFireAlert({
      alertId: OpsAlertId.DISPUTE_RATE_SPIKE,
      shouldFire:
        started >= thresholds.disputeRateMinSample &&
        disputeRate >= thresholds.disputeRateMaxPct,
      detail: {
        dispute_rate_pct: disputeRate,
        threshold_pct: thresholds.disputeRateMaxPct,
        sample: started,
      },
    });

    const completionRate = kpis.rates.extension_flow_completion_rate_pct;
    await this.maybeFireAlert({
      alertId: OpsAlertId.COMPLETION_RATE_DROP,
      shouldFire:
        started >= thresholds.completionRateMinSample &&
        completionRate < thresholds.completionRateMinPct,
      detail: {
        completion_rate_pct: completionRate,
        threshold_pct: thresholds.completionRateMinPct,
        sample: started,
      },
    });
  }

  async fireAntiFraudAlert(detail: Record<string, unknown>): Promise<void> {
    await this.maybeFireAlert({
      alertId: OpsAlertId.ANTI_FRAUD_VELOCITY,
      shouldFire: true,
      detail,
      force: true,
    });
  }

  async maybeFireAlert(params: {
    alertId: OpsAlertIdType;
    shouldFire: boolean;
    detail: Record<string, unknown>;
    force?: boolean;
  }): Promise<void> {
    if (!params.shouldFire) {
      return;
    }

    const now = Date.now();
    const last = this.lastFiredAt.get(params.alertId) ?? 0;
    if (!params.force && now - last < ALERT_DEDUP_MS) {
      return;
    }

    this.lastFiredAt.set(params.alertId, now);
    const firedAt = new Date(now).toISOString();
    this.activeAlerts.set(params.alertId, {
      alertId: params.alertId,
      firedAt,
      detail: params.detail,
    });

    const idempotencyKey = `ops-alert:${params.alertId}:${Math.floor(now / ALERT_DEDUP_MS)}`;
    const existing = await this.prisma.outboxEvent.findFirst({
      where: {
        eventType: 'OPS_ALERT',
        aggregateId: params.alertId,
        createdAt: { gte: new Date(now - ALERT_DEDUP_MS) },
      },
    });
    if (existing) {
      return;
    }

    const { requestId } = getAuditContext();
    const payload = {
      alertId: params.alertId,
      firedAt,
      correlationId: requestId,
      ...params.detail,
    } satisfies Prisma.InputJsonObject;

    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'OPS_ALERT',
        aggregateType: 'ops_alert',
        aggregateId: params.alertId,
        payload: {
          ...payload,
          idempotencyKey,
        },
      },
    });

    this.logger.warn(
      JSON.stringify({
        event: ExtensionFlowLogCode.OPS_ALERT_FIRED,
        logCode: ExtensionFlowLogCode.OPS_ALERT_FIRED,
        trace: 'extension-flow',
        correlationId: requestId,
        requestId,
        alert: true,
        alertId: params.alertId,
        metric: 'extension_flow_ops_alerts_total',
        labels: { alert_id: params.alertId },
        ...params.detail,
      }),
    );
  }
}
