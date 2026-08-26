/**
 * H2: Shared 429 / rate-limit backoff state (Steam + API polls).
 */

export const RATE_LIMIT_BASE_BACKOFF_MS = 30_000;
export const RATE_LIMIT_MAX_BACKOFF_MS = 5 * 60_000;

export type RateLimitBackoffState = {
  consecutiveHits: number;
  blockedUntilMs: number | null;
  lastHitAtMs: number | null;
};

export function defaultRateLimitBackoffState(): RateLimitBackoffState {
  return {
    consecutiveHits: 0,
    blockedUntilMs: null,
    lastHitAtMs: null,
  };
}

export function parseRetryAfterMs(
  headerValue: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  const raw = headerValue?.trim();
  if (!raw) {
    return null;
  }
  if (/^\d+$/.test(raw)) {
    return Math.max(0, Number(raw) * 1000);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - nowMs);
  }
  return null;
}

export function computeRateLimitBackoffMs(
  consecutiveHits: number,
  retryAfterMs?: number | null,
): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(RATE_LIMIT_MAX_BACKOFF_MS, retryAfterMs);
  }
  const hits = Math.max(1, consecutiveHits);
  const exp = Math.min(
    RATE_LIMIT_MAX_BACKOFF_MS,
    RATE_LIMIT_BASE_BACKOFF_MS * 2 ** (hits - 1),
  );
  return exp;
}

export function markRateLimitHit(
  state: RateLimitBackoffState,
  opts?: { nowMs?: number; retryAfterMs?: number | null },
): RateLimitBackoffState {
  const nowMs = opts?.nowMs ?? Date.now();
  const consecutiveHits = Math.max(0, state.consecutiveHits) + 1;
  const backoffMs = computeRateLimitBackoffMs(
    consecutiveHits,
    opts?.retryAfterMs,
  );
  return {
    consecutiveHits,
    lastHitAtMs: nowMs,
    blockedUntilMs: nowMs + backoffMs,
  };
}

export function clearRateLimitBackoff(): RateLimitBackoffState {
  return defaultRateLimitBackoffState();
}

export function isRateLimitBlocked(
  state: RateLimitBackoffState,
  nowMs = Date.now(),
): boolean {
  return (
    state.blockedUntilMs != null &&
    Number.isFinite(state.blockedUntilMs) &&
    state.blockedUntilMs > nowMs
  );
}

export function rateLimitRemainingMs(
  state: RateLimitBackoffState,
  nowMs = Date.now(),
): number {
  if (!isRateLimitBlocked(state, nowMs) || state.blockedUntilMs == null) {
    return 0;
  }
  return Math.max(0, state.blockedUntilMs - nowMs);
}

/** Exponential delay between fetch retries (attempt is 1-based). */
export function resolveFetchRetryDelayMs(params: {
  attempt: number;
  baseDelayMs: number;
  response?: { status: number; headers?: { get(name: string): string | null } };
  nowMs?: number;
}): number {
  const { attempt, baseDelayMs, response, nowMs = Date.now() } = params;
  if (response?.status === 429) {
    const retryAfter = parseRetryAfterMs(
      response.headers?.get('retry-after') ?? null,
      nowMs,
    );
    if (retryAfter != null) {
      return Math.min(RATE_LIMIT_MAX_BACKOFF_MS, Math.max(baseDelayMs, retryAfter));
    }
  }
  const exp = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(exp * 0.1 * Math.random());
  return Math.min(RATE_LIMIT_MAX_BACKOFF_MS, exp + jitter);
}
