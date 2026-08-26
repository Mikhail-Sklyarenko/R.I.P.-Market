import type { Order } from '../api/types.ts';

/**
 * C5: trade-window countdown + «Проблема с обменом» escalation to support
 * with orderId / offerId / verify snapshot prefill.
 */

export type TradeTimeoutUrgency = 'ok' | 'soon' | 'critical' | 'expired';

export type TradeTimeoutView = {
  remainingMs: number;
  remainingMinutes: number;
  hours: number;
  minutesPart: number;
  deadlineAt: string;
  urgency: TradeTimeoutUrgency;
};

export type TradeEscalationReason = 'trade_problem' | 'mismatch' | 'timeout';

export type TradeEscalationPack = {
  version: 1;
  reason: TradeEscalationReason;
  orderId: string;
  offerId: string | null;
  orderStatus: string;
  role: 'buyer' | 'seller' | 'other';
  verificationStatus: string | null;
  failedCheckKeys: string[];
  nextActionKind: string | null;
  remainingMinutes: number | null;
  /** Present when pack comes from extension in-flow dispute evidence. */
  tradeTimeoutAt?: string | null;
  capturedAt: string;
};

export const SUPPORT_ESCALATION_STORAGE_PREFIX = 'rip:support-escalation:';

const SOON_MINUTES = 15;
const CRITICAL_MINUTES = 5;

export function resolveTradeTimeoutView(params: {
  orderCreatedAt: string;
  timeoutMinutes: number;
  nowMs?: number;
}): TradeTimeoutView | null {
  const createdAt = new Date(params.orderCreatedAt).getTime();
  const timeoutMinutes = Math.max(1, params.timeoutMinutes);
  if (!Number.isFinite(createdAt)) {
    return null;
  }

  const now = params.nowMs ?? Date.now();
  const deadlineMs = createdAt + timeoutMinutes * 60_000;
  const remainingMs = deadlineMs - now;
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const totalMinutesLeft = Math.max(0, remainingMinutes);
  const hours = Math.floor(totalMinutesLeft / 60);
  const minutesPart = totalMinutesLeft % 60;

  let urgency: TradeTimeoutUrgency = 'ok';
  if (remainingMs <= 0) {
    urgency = 'expired';
  } else if (remainingMinutes <= CRITICAL_MINUTES) {
    urgency = 'critical';
  } else if (remainingMinutes <= SOON_MINUTES) {
    urgency = 'soon';
  }

  return {
    remainingMs,
    remainingMinutes,
    hours,
    minutesPart,
    deadlineAt: new Date(deadlineMs).toISOString(),
    urgency,
  };
}

/** True while the Steam trade window still matters for the client. */
export function shouldShowTradeTimeout(orderStatus: string): boolean {
  return (
    orderStatus === 'WAITING_TRADE' ||
    orderStatus === 'TRADE_CONFIRMED' ||
    orderStatus === 'DISPUTE'
  );
}

export function tradeEscalationStorageKey(orderId: string): string {
  return `${SUPPORT_ESCALATION_STORAGE_PREFIX}${orderId}`;
}

export function buildTradeEscalationPack(params: {
  order: Pick<Order, 'id' | 'status' | 'tradeOperation' | 'tradeVerification'>;
  role: 'buyer' | 'seller' | 'other';
  reason: TradeEscalationReason;
  remainingMinutes?: number | null;
}): TradeEscalationPack {
  const verification = params.order.tradeVerification;
  return {
    version: 1,
    reason: params.reason,
    orderId: params.order.id,
    offerId: params.order.tradeOperation?.externalOfferId ?? null,
    orderStatus: params.order.status,
    role: params.role,
    verificationStatus: verification?.status ?? null,
    failedCheckKeys:
      verification?.failedChecks?.map((check) => check.key) ?? [],
    nextActionKind: verification?.nextAction?.kind ?? null,
    remainingMinutes:
      params.remainingMinutes === undefined ? null : params.remainingMinutes,
    tradeTimeoutAt: null,
    capturedAt: new Date().toISOString(),
  };
}

export function persistTradeEscalationPack(pack: TradeEscalationPack): void {
  try {
    sessionStorage.setItem(
      tradeEscalationStorageKey(pack.orderId),
      JSON.stringify(pack),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readTradeEscalationPack(
  orderId: string,
): TradeEscalationPack | null {
  try {
    const raw = sessionStorage.getItem(tradeEscalationStorageKey(orderId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TradeEscalationPack;
    if (parsed?.version !== 1 || parsed.orderId !== orderId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeTradeEscalationEvidence(
  pack: TradeEscalationPack,
): string {
  const json = JSON.stringify(pack);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function normalizeTradeEscalationPack(
  parsed: Record<string, unknown>,
): TradeEscalationPack | null {
  if (parsed.version !== 1 || typeof parsed.orderId !== 'string' || !parsed.orderId) {
    return null;
  }
  const reasonRaw = parsed.reason;
  const reason: TradeEscalationReason =
    reasonRaw === 'trade_problem' ||
    reasonRaw === 'mismatch' ||
    reasonRaw === 'timeout'
      ? reasonRaw
      : 'trade_problem';
  const roleRaw = parsed.role;
  const role =
    roleRaw === 'buyer' || roleRaw === 'seller' || roleRaw === 'other'
      ? roleRaw
      : 'other';
  const failedCheckKeys = Array.isArray(parsed.failedCheckKeys)
    ? parsed.failedCheckKeys.filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      )
    : [];
  return {
    version: 1,
    reason,
    orderId: parsed.orderId,
    offerId: typeof parsed.offerId === 'string' ? parsed.offerId : null,
    orderStatus:
      typeof parsed.orderStatus === 'string' ? parsed.orderStatus : 'UNKNOWN',
    role,
    verificationStatus:
      typeof parsed.verificationStatus === 'string'
        ? parsed.verificationStatus
        : null,
    failedCheckKeys,
    nextActionKind:
      typeof parsed.nextActionKind === 'string' ? parsed.nextActionKind : null,
    remainingMinutes:
      typeof parsed.remainingMinutes === 'number'
        ? parsed.remainingMinutes
        : null,
    tradeTimeoutAt:
      typeof parsed.tradeTimeoutAt === 'string' ? parsed.tradeTimeoutAt : null,
    capturedAt:
      typeof parsed.capturedAt === 'string'
        ? parsed.capturedAt
        : new Date().toISOString(),
  };
}

export function decodeTradeEscalationEvidence(
  encoded: string | null | undefined,
): TradeEscalationPack | null {
  const raw = encoded?.trim();
  if (!raw) {
    return null;
  }
  try {
    const padded = raw.replaceAll('-', '+').replaceAll('_', '/');
    const pad =
      padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    return normalizeTradeEscalationPack(parsed);
  } catch {
    return null;
  }
}

/**
 * Build /support path with deal + offer + topic prefill.
 * Pass `persist: true` (e.g. on CTA click) to store pack for ticket body.
 * Always embeds `evidence` so extension / new-tab flows work without sessionStorage.
 */
export function buildTradeProblemSupportPath(
  params: {
    order: Pick<Order, 'id' | 'status' | 'tradeOperation' | 'tradeVerification'>;
    role: 'buyer' | 'seller' | 'other';
    reason?: TradeEscalationReason;
    remainingMinutes?: number | null;
  },
  options?: { persist?: boolean },
): string {
  const reason = params.reason ?? 'trade_problem';
  const pack = buildTradeEscalationPack({
    order: params.order,
    role: params.role,
    reason,
    remainingMinutes: params.remainingMinutes,
  });
  if (options?.persist) {
    persistTradeEscalationPack(pack);
  }

  const query = new URLSearchParams();
  query.set('dealId', pack.orderId);
  query.set('topic', 'deal');
  query.set('reason', reason);
  if (pack.offerId) {
    query.set('offerId', pack.offerId);
  }
  if (pack.verificationStatus) {
    query.set('verifyStatus', pack.verificationStatus);
  }
  if (pack.failedCheckKeys.length > 0) {
    query.set('failedChecks', pack.failedCheckKeys.join(','));
  }
  if (pack.nextActionKind) {
    query.set('nextAction', pack.nextActionKind);
  }
  query.set('capturedAt', pack.capturedAt);
  query.set('evidence', encodeTradeEscalationEvidence(pack));
  return `/support?${query.toString()}`;
}

export function formatTradeEscalationTicketBody(
  pack: TradeEscalationPack,
  userNote = '',
): string {
  const lines = [
    '--- R.I.P trade escalation ---',
    `Reason: ${pack.reason}`,
    `Deal ID: ${pack.orderId}`,
    `Offer ID: ${pack.offerId ?? 'none'}`,
    `Order status: ${pack.orderStatus}`,
    `Role: ${pack.role}`,
    `Verify status: ${pack.verificationStatus ?? 'n/a'}`,
    `Failed checks: ${
      pack.failedCheckKeys.length > 0 ? pack.failedCheckKeys.join(', ') : 'none'
    }`,
    `Next action: ${pack.nextActionKind ?? 'n/a'}`,
    `Timeout remaining (min): ${
      pack.remainingMinutes === null ? 'n/a' : String(pack.remainingMinutes)
    }`,
    `Trade timeout at: ${pack.tradeTimeoutAt ?? 'n/a'}`,
    `Captured at: ${pack.capturedAt}`,
    '---',
  ];
  const note = userNote.trim();
  if (note) {
    lines.push('', note);
  } else {
    lines.push('', '(опишите, что пошло не так)');
  }
  return lines.join('\n');
}

export function parseSupportEscalationFromSearch(
  search: URLSearchParams,
): {
  dealId: string;
  offerId: string;
  topic: 'deal' | null;
  reason: TradeEscalationReason | null;
  verifyStatus: string;
  failedChecks: string[];
  nextAction: string;
  capturedAt: string;
  evidence: TradeEscalationPack | null;
} {
  const dealId =
    search.get('dealId')?.trim() || search.get('orderId')?.trim() || '';
  const offerId = search.get('offerId')?.trim() || '';
  const topicRaw = search.get('topic')?.trim();
  const reasonRaw = search.get('reason')?.trim();
  const reason =
    reasonRaw === 'trade_problem' ||
    reasonRaw === 'mismatch' ||
    reasonRaw === 'timeout'
      ? reasonRaw
      : null;
  const failedChecks = (search.get('failedChecks') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    dealId,
    offerId,
    topic: topicRaw === 'deal' ? 'deal' : null,
    reason,
    verifyStatus: search.get('verifyStatus')?.trim() || '',
    failedChecks,
    nextAction: search.get('nextAction')?.trim() || '',
    capturedAt: search.get('capturedAt')?.trim() || '',
    evidence: decodeTradeEscalationEvidence(search.get('evidence')),
  };
}
