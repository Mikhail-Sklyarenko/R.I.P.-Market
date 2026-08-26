/**
 * Guard / Confirm UX helpers.
 * Steam never auto-confirms from the extension — we only detect when Guard is
 * still needed vs already cleared (poll state 9 → 2).
 */

export type TradeTaskConfirmPendingInput = {
  executionPhase: string | null;
  lastErrorCode: string | null;
  statusEvents: Array<{
    phase: string;
    payload: unknown;
    reasonCode?: string | null;
  }>;
};

export type DeliveryOfferStatusProbe = {
  offerStatus?: string | null;
} | null;

export function historicallyNeededSteamGuard(
  task: TradeTaskConfirmPendingInput,
): boolean {
  if (task.executionPhase === 'CONFIRM_PENDING') {
    return true;
  }
  if (
    task.lastErrorCode === 'CONFIRM_PENDING' ||
    task.lastErrorCode === 'STEAM_GUARD_REQUIRED'
  ) {
    return true;
  }
  for (const event of task.statusEvents) {
    if (event.phase === 'CONFIRM_PENDING') {
      return true;
    }
    if (
      event.phase !== 'OFFER_SENT' ||
      !event.payload ||
      typeof event.payload !== 'object'
    ) {
      continue;
    }
    if ((event.payload as { confirmPending?: unknown }).confirmPending === true) {
      return true;
    }
  }
  return false;
}

/**
 * True while the seller still needs to confirm in Steam Mobile.
 * Clears when Steam reports Active (pending) or a terminal offer state.
 */
export function extractTradeTaskConfirmPending(
  task: TradeTaskConfirmPendingInput,
  deliveryProbe?: DeliveryOfferStatusProbe,
): boolean {
  if (!historicallyNeededSteamGuard(task)) {
    return false;
  }

  const offerStatus = deliveryProbe?.offerStatus ?? null;
  if (
    offerStatus === 'pending' ||
    offerStatus === 'accepted' ||
    offerStatus === 'declined' ||
    offerStatus === 'expired'
  ) {
    return false;
  }
  if (offerStatus === 'needs_confirmation') {
    return true;
  }
  // No poll yet / unknown — keep waiting for Guard.
  return true;
}

export function extractTradeTaskConfirmPendingSince(
  events: Array<{ phase: string; payload: unknown; createdAt?: Date | string }>,
): string | null {
  // Events are newest-first; find the earliest Guard signal.
  let earliest: Date | null = null;
  for (const event of events) {
    const isConfirmPhase = event.phase === 'CONFIRM_PENDING';
    const isConfirmSent =
      event.phase === 'OFFER_SENT' &&
      event.payload &&
      typeof event.payload === 'object' &&
      (event.payload as { confirmPending?: unknown }).confirmPending === true;
    if (!isConfirmPhase && !isConfirmSent) {
      continue;
    }
    if (!event.createdAt) {
      continue;
    }
    const at = new Date(event.createdAt);
    if (!Number.isFinite(at.getTime())) {
      continue;
    }
    if (!earliest || at.getTime() < earliest.getTime()) {
      earliest = at;
    }
  }
  return earliest ? earliest.toISOString() : null;
}
