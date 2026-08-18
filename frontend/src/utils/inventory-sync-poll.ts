export const INVENTORY_SYNC_POLL_MAX_MS = 90_000;
export const INVENTORY_SYNC_POLL_DELAYS_MS = [2_500, 5_000, 10_000, 15_000] as const;

export type InventorySyncPollDecision = 'fresh' | 'poll' | 'failed' | 'timeout';

export function nextInventorySyncPollDelayMs(attemptIndex: number): number {
  const last =
    INVENTORY_SYNC_POLL_DELAYS_MS[INVENTORY_SYNC_POLL_DELAYS_MS.length - 1] ??
    15_000;
  return INVENTORY_SYNC_POLL_DELAYS_MS[attemptIndex] ?? last;
}

export function decideInventorySyncPoll(input: {
  stale: boolean;
  backgroundPending?: boolean;
  errorCode?: string | null;
  elapsedMs: number;
}): InventorySyncPollDecision {
  if (!input.stale) {
    return 'fresh';
  }
  if (input.elapsedMs >= INVENTORY_SYNC_POLL_MAX_MS) {
    return 'timeout';
  }
  if (input.errorCode && !input.backgroundPending) {
    return 'failed';
  }
  return 'poll';
}
