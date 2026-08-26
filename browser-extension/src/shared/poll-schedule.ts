/**
 * I4: Adaptive poll schedule — aggressive when a deal/task is active,
 * calm when idle. Chrome may still clamp sub-minute alarms; heartbeat
 * remains the p95 floor.
 */

export type PollScheduleMode = 'idle' | 'active';

export type PollSchedulePeriods = {
  /** chrome.alarms periodInMinutes for task poll */
  tasksMinutes: number;
  /** chrome.alarms periodInMinutes for active-trades poll */
  activeTradesMinutes: number;
  /** chrome.alarms periodInMinutes for heartbeat (+ backup poll) */
  heartbeatMinutes: number;
};

/** Idle: save CPU/API when nothing needs the seller/buyer. */
export const IDLE_POLL_SCHEDULE: PollSchedulePeriods = {
  tasksMinutes: 1,
  activeTradesMinutes: 2,
  heartbeatMinutes: 2,
};

/**
 * Active: as aggressive as Chrome allows for new purchase / Guard / Accept.
 * 0.05 ≈ 3s intent; clamps often land near 15–60s — heartbeat still polls.
 */
export const ACTIVE_POLL_SCHEDULE: PollSchedulePeriods = {
  tasksMinutes: 0.05,
  activeTradesMinutes: 0.25,
  heartbeatMinutes: 1,
};

export const POLL_MODE_STORAGE_KEY = 'rip:pollScheduleMode';

export type DealActiveTradeLike = {
  orderStatus?: string | null;
  offerId?: string | null;
  role?: 'buyer' | 'seller' | string | null;
  nextAction?: { kind?: string | null } | null;
  verificationStatus?: string | null;
};

/**
 * Narrow “deal active” for wake aggressiveness — in-flight P2P, not completed.
 */
export function isDealActiveTrade(trade: DealActiveTradeLike): boolean {
  const status = trade.orderStatus ?? '';
  if (
    status === 'WAITING_TRADE' ||
    status === 'TRADE_CONFIRMED' ||
    status === 'SETTLEMENT_HOLD' ||
    status === 'DISPUTE'
  ) {
    return true;
  }
  const kind = trade.nextAction?.kind;
  if (
    kind === 'confirm_guard' ||
    kind === 'accept_in_steam' ||
    kind === 'send_manual' ||
    kind === 'confirm_sent' ||
    kind === 'confirm_received' ||
    kind === 'report_issue'
  ) {
    return true;
  }
  return trade.verificationStatus === 'mismatch';
}

export function resolvePollScheduleMode(params: {
  trades?: DealActiveTradeLike[] | null;
  pendingTaskCount?: number | null;
  backendHasPendingWork?: boolean | null;
  backendHasActiveDeal?: boolean | null;
}): PollScheduleMode {
  if (params.backendHasPendingWork === true || params.backendHasActiveDeal === true) {
    return 'active';
  }
  if ((params.pendingTaskCount ?? 0) > 0) {
    return 'active';
  }
  const trades = params.trades ?? [];
  if (trades.some(isDealActiveTrade)) {
    return 'active';
  }
  return 'idle';
}

export function periodsForPollMode(mode: PollScheduleMode): PollSchedulePeriods {
  return mode === 'active' ? ACTIVE_POLL_SCHEDULE : IDLE_POLL_SCHEDULE;
}

export function parsePollScheduleMode(raw: unknown): PollScheduleMode | null {
  return raw === 'active' || raw === 'idle' ? raw : null;
}
