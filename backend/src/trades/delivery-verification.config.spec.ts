import {
  computeRateLimitBackoffMs,
  getTradeTimeoutMs,
} from './delivery-verification.config';

describe('delivery-verification.config', () => {
  it('computes bounded exponential backoff', () => {
    process.env.TRADE_POLL_BACKOFF_MS = '1000';
    process.env.TRADE_POLL_BACKOFF_MAX_MS = '5000';
    process.env.TRADE_POLL_BACKOFF_MULTIPLIER = '2';

    const first = computeRateLimitBackoffMs(1);
    const third = computeRateLimitBackoffMs(3);

    expect(first).toBeGreaterThanOrEqual(1000);
    expect(third).toBeGreaterThan(first);
    expect(third).toBeLessThanOrEqual(5300);
  });

  it('reads trade timeout from env', () => {
    process.env.TRADE_TIMEOUT_MINUTES = '45';
    expect(getTradeTimeoutMs()).toBe(45 * 60_000);
  });
});
