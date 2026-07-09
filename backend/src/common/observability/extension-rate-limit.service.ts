import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { ExtensionFlowLogCode } from './extension-flow-log-codes';
import {
  extensionRateLimitConfig,
  isExtensionRateLimitsEnabled,
} from './extension-flow-observability.config';
import { getAuditContext } from './audit-context';

type Bucket = {
  timestamps: number[];
};

@Injectable()
export class ExtensionRateLimitService {
  private readonly logger = new Logger(ExtensionRateLimitService.name);
  private readonly buckets = new Map<string, Bucket>();

  assertHandshakeAllowed(userId: string): void {
    const limits = extensionRateLimitConfig();
    this.assertLimit(
      `handshake:${userId}`,
      limits.handshakePerUserPerHour,
      60 * 60 * 1000,
      'handshake',
    );
  }

  assertSignedRequestAllowed(sessionId: string): void {
    const limits = extensionRateLimitConfig();
    this.assertLimit(
      `signed:${sessionId}`,
      limits.signedRequestsPerSessionPerMinute,
      60 * 1000,
      'signed_request',
    );
  }

  assertTradeReferenceAllowed(userId: string): void {
    const limits = extensionRateLimitConfig();
    this.assertLimit(
      `trade-ref:${userId}`,
      limits.tradeReferencePerUserPerMinute,
      60 * 1000,
      'trade_reference',
    );
  }

  private assertLimit(
    key: string,
    max: number,
    windowMs: number,
    endpoint: string,
  ): void {
    if (!isExtensionRateLimitsEnabled()) {
      return;
    }

    const count = this.increment(key, windowMs);
    if (count <= max) {
      return;
    }

    const { requestId } = getAuditContext();
    this.logger.warn(
      JSON.stringify({
        event: ExtensionFlowLogCode.RATE_LIMITED,
        logCode: ExtensionFlowLogCode.RATE_LIMITED,
        trace: 'extension-flow',
        correlationId: requestId,
        requestId,
        alert: true,
        endpoint,
        key,
        count,
        max,
        windowMs,
        metric: 'extension_flow_rate_limited_total',
        labels: { endpoint },
      }),
    );

    throw new AppException(
      ErrorCode.EXTENSION_RATE_LIMITED,
      'Extension rate limit exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
      { endpoint, retryAfterMs: windowMs },
    );
  }

  private increment(key: string, windowMs: number): number {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    const cutoff = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((at) => at >= cutoff);
    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return bucket.timestamps.length;
  }
}
