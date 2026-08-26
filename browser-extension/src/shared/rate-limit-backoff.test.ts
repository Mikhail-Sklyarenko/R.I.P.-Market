import { describe, expect, it } from 'vitest';
import {
  clearRateLimitBackoff,
  computeRateLimitBackoffMs,
  defaultRateLimitBackoffState,
  isRateLimitBlocked,
  markRateLimitHit,
  parseRetryAfterMs,
  RATE_LIMIT_BASE_BACKOFF_MS,
  resolveFetchRetryDelayMs,
} from './rate-limit-backoff.js';

describe('rate-limit-backoff', () => {
  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfterMs('12')).toBe(12_000);
    const now = Date.parse('2026-08-27T00:00:00.000Z');
    expect(
      parseRetryAfterMs('Thu, 27 Aug 2026 00:00:30 GMT', now),
    ).toBe(30_000);
  });

  it('escalates backoff on consecutive hits', () => {
    expect(computeRateLimitBackoffMs(1)).toBe(RATE_LIMIT_BASE_BACKOFF_MS);
    expect(computeRateLimitBackoffMs(2)).toBe(RATE_LIMIT_BASE_BACKOFF_MS * 2);
    expect(computeRateLimitBackoffMs(3, 90_000)).toBe(90_000);
  });

  it('blocks until window ends and clears', () => {
    const now = 1_000_000;
    const hit = markRateLimitHit(defaultRateLimitBackoffState(), {
      nowMs: now,
      retryAfterMs: 45_000,
    });
    expect(isRateLimitBlocked(hit, now + 1_000)).toBe(true);
    expect(isRateLimitBlocked(hit, now + 50_000)).toBe(false);
    expect(clearRateLimitBackoff().blockedUntilMs).toBeNull();
  });

  it('uses Retry-After for 429 fetch delay', () => {
    const delay = resolveFetchRetryDelayMs({
      attempt: 1,
      baseDelayMs: 800,
      response: {
        status: 429,
        headers: { get: (name) => (name === 'retry-after' ? '5' : null) },
      },
      nowMs: Date.now(),
    });
    expect(delay).toBe(5_000);
  });
});
