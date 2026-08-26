/**
 * H2: Persist global rate-limit backoff for SW polls / Steam fetches.
 */
import {
  clearRateLimitBackoff,
  defaultRateLimitBackoffState,
  isRateLimitBlocked,
  markRateLimitHit,
  type RateLimitBackoffState,
} from './rate-limit-backoff.js';

export const RATE_LIMIT_BACKOFF_STORAGE_KEY = 'rip:rateLimitBackoff';

export function parseRateLimitBackoffState(
  raw: unknown,
): RateLimitBackoffState {
  if (!raw || typeof raw !== 'object') {
    return defaultRateLimitBackoffState();
  }
  const record = raw as Record<string, unknown>;
  return {
    consecutiveHits:
      typeof record.consecutiveHits === 'number' ? record.consecutiveHits : 0,
    blockedUntilMs:
      typeof record.blockedUntilMs === 'number' ? record.blockedUntilMs : null,
    lastHitAtMs:
      typeof record.lastHitAtMs === 'number' ? record.lastHitAtMs : null,
  };
}

export async function loadRateLimitBackoff(): Promise<RateLimitBackoffState> {
  try {
    const stored = await chrome.storage.session.get(
      RATE_LIMIT_BACKOFF_STORAGE_KEY,
    );
    return parseRateLimitBackoffState(
      stored[RATE_LIMIT_BACKOFF_STORAGE_KEY],
    );
  } catch {
    return defaultRateLimitBackoffState();
  }
}

export async function saveRateLimitBackoff(
  state: RateLimitBackoffState,
): Promise<void> {
  await chrome.storage.session.set({
    [RATE_LIMIT_BACKOFF_STORAGE_KEY]: state,
  });
}

export async function noteRateLimitHit(
  retryAfterMs?: number | null,
): Promise<RateLimitBackoffState> {
  const next = markRateLimitHit(await loadRateLimitBackoff(), {
    retryAfterMs,
  });
  await saveRateLimitBackoff(next);
  return next;
}

export async function noteRateLimitCleared(): Promise<void> {
  await saveRateLimitBackoff(clearRateLimitBackoff());
}

export async function canProceedPastRateLimit(
  nowMs = Date.now(),
): Promise<boolean> {
  return !isRateLimitBlocked(await loadRateLimitBackoff(), nowMs);
}
