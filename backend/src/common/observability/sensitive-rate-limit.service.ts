import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

type Bucket = { timestamps: number[] };

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function isEnabled(): boolean {
  // Fail-open only when explicitly disabled (local/e2e). Default on.
  return process.env.ENABLE_SENSITIVE_RATE_LIMITS !== 'false';
}

/**
 * In-process sliding-window limiter for money/auth abuse surfaces.
 * Not a substitute for edge WAF — stops casual scripted abuse on a single node.
 */
@Injectable()
export class SensitiveRateLimitService {
  private readonly logger = new Logger(SensitiveRateLimitService.name);
  private readonly buckets = new Map<string, Bucket>();

  assertMockLogin(ip: string): void {
    this.assert(
      `mock-login:${ip || 'unknown'}`,
      parsePositiveInt(process.env.RL_MOCK_LOGIN_PER_MIN, 20),
      60_000,
      'mock_login',
    );
  }

  assertMockDeposit(userId: string): void {
    this.assert(
      `mock-deposit:${userId}`,
      parsePositiveInt(process.env.RL_MOCK_DEPOSIT_PER_MIN, 10),
      60_000,
      'mock_deposit',
    );
  }

  assertWithdrawal(userId: string): void {
    this.assert(
      `withdraw:${userId}`,
      parsePositiveInt(process.env.RL_WITHDRAW_PER_MIN, 5),
      60_000,
      'withdraw',
    );
  }

  assertSteamLoginUrl(ip: string): void {
    this.assert(
      `steam-login-url:${ip || 'unknown'}`,
      parsePositiveInt(process.env.RL_STEAM_LOGIN_URL_PER_MIN, 30),
      60_000,
      'steam_login_url',
    );
  }

  assertDepositCheckout(userId: string): void {
    this.assert(
      `deposit-checkout:${userId}`,
      parsePositiveInt(process.env.RL_DEPOSIT_CHECKOUT_PER_MIN, 10),
      60_000,
      'deposit_checkout',
    );
  }

  private assert(
    key: string,
    max: number,
    windowMs: number,
    endpoint: string,
  ): void {
    if (!isEnabled()) {
      return;
    }
    const count = this.increment(key, windowMs);
    if (count <= max) {
      return;
    }
    this.logger.warn(
      JSON.stringify({
        event: 'sensitive_rate_limited',
        endpoint,
        key,
        count,
        max,
        windowMs,
      }),
    );
    throw new AppException(
      ErrorCode.RATE_LIMITED,
      'Too many requests. Please try again shortly.',
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
