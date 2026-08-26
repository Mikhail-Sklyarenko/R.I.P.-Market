/**
 * E3: Quiet notifications — Chrome alerts without spam.
 * Guard / Accept-ready / Mismatch / new sale (I4); notify on state transition;
 * group when multiple; mute per deal.
 * H1: titles/bodies follow extension locale.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import { resolveTradeNextAction } from './popup-next-action.js';

export const QUIET_NOTIFY_STORAGE_KEY = 'rip:quietNotifications';
export const QUIET_NOTIFY_GROUP_THRESHOLD = 2;
/** Minimum gap between any two Chrome notifications (ms). */
export const QUIET_NOTIFY_MIN_INTERVAL_MS = 20_000;

export type QuietNotifyKind =
  | 'confirm_guard'
  | 'accept_ready'
  | 'mismatch'
  | 'new_deal';

export type QuietNotifyEvent = {
  orderId: string;
  orderShortId: string;
  kind: QuietNotifyKind;
  fingerprint: string;
  title: string;
  message: string;
  clickUrl: string;
  itemName: string;
  role: 'buyer' | 'seller';
};

export type QuietNotifyState = {
  enabled: boolean;
  /** orderId → last notified fingerprint */
  fingerprints: Record<string, string>;
  mutedOrderIds: string[];
  lastNotifyAt: string | null;
};

export type QuietNotifyPlan =
  | { type: 'none' }
  | {
      type: 'single';
      event: QuietNotifyEvent;
      notificationId: string;
    }
  | {
      type: 'group';
      events: QuietNotifyEvent[];
      notificationId: string;
      title: string;
      message: string;
      clickUrl: string;
    };

const KIND_PRIORITY: Record<QuietNotifyKind, number> = {
  mismatch: 0,
  confirm_guard: 1,
  accept_ready: 2,
  new_deal: 3,
};

export function defaultQuietNotifyState(): QuietNotifyState {
  return {
    enabled: true,
    fingerprints: {},
    mutedOrderIds: [],
    lastNotifyAt: null,
  };
}

export function parseQuietNotifyState(raw: unknown): QuietNotifyState {
  if (!raw || typeof raw !== 'object') {
    return defaultQuietNotifyState();
  }
  const record = raw as Record<string, unknown>;
  const fingerprints =
    record.fingerprints && typeof record.fingerprints === 'object'
      ? Object.fromEntries(
          Object.entries(record.fingerprints as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === 'string' && typeof entry[1] === 'string',
          ),
        )
      : {};
  const mutedOrderIds = Array.isArray(record.mutedOrderIds)
    ? record.mutedOrderIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    enabled: record.enabled !== false,
    fingerprints,
    mutedOrderIds,
    lastNotifyAt:
      typeof record.lastNotifyAt === 'string' ? record.lastNotifyAt : null,
  };
}

export function resolveQuietNotifyKind(
  trade: Pick<
    TradeVerificationResult,
    'verificationStatus' | 'nextAction' | 'orderStatus' | 'role' | 'offerId'
  >,
): QuietNotifyKind | null {
  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue' ||
    trade.orderStatus === 'DISPUTE'
  ) {
    return 'mismatch';
  }
  if (trade.nextAction.kind === 'confirm_guard') {
    return 'confirm_guard';
  }
  if (trade.nextAction.kind === 'accept_in_steam') {
    return 'accept_ready';
  }
  // I4: new purchase for seller — auto-send starting or manual fallback.
  if (
    trade.role === 'seller' &&
    trade.orderStatus === 'WAITING_TRADE' &&
    (trade.nextAction.kind === 'send_manual' ||
      (trade.nextAction.kind === 'wait' && !trade.offerId))
  ) {
    return 'new_deal';
  }
  return null;
}

export function buildQuietNotifyFingerprint(
  trade: Pick<TradeVerificationResult, 'orderId' | 'offerId' | 'verificationStatus'>,
  kind: QuietNotifyKind,
): string {
  return `${trade.orderId}:${kind}:${trade.offerId ?? ''}:${trade.verificationStatus}`;
}

function buildEventCopy(
  trade: TradeVerificationResult,
  kind: QuietNotifyKind,
  locale: ExtensionLocale,
): Pick<QuietNotifyEvent, 'title' | 'message'> {
  const t = createExtensionT(locale);
  const short = `#${trade.orderShortId}`;
  const item = trade.item.marketHashName;
  switch (kind) {
    case 'confirm_guard':
      return {
        title: t('notify.guardTitle'),
        message: t('notify.guardBody', { short, item }),
      };
    case 'accept_ready':
      return {
        title: t('notify.acceptTitle'),
        message: t('notify.acceptBody', { short, item }),
      };
    case 'mismatch':
      return {
        title: t('notify.mismatchTitle'),
        message: t('notify.mismatchBody', { short, item }),
      };
    case 'new_deal':
      return {
        title: t('notify.newDealTitle'),
        message: t('notify.newDealBody', { short, item }),
      };
  }
}

export function buildQuietNotifyEvent(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): QuietNotifyEvent | null {
  const kind = resolveQuietNotifyKind(trade);
  if (!kind) {
    return null;
  }
  const next = resolveTradeNextAction(trade, locale);
  const clickUrl =
    (next.primary.mode === 'link' && next.primary.href) || trade.siteUrl;
  const copy = buildEventCopy(trade, kind, locale);
  return {
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    kind,
    fingerprint: buildQuietNotifyFingerprint(trade, kind),
    title: copy.title,
    message: copy.message,
    clickUrl,
    itemName: trade.item.marketHashName,
    role: trade.role,
  };
}

export function isOrderMuted(
  state: QuietNotifyState,
  orderId: string,
): boolean {
  return state.mutedOrderIds.includes(orderId);
}

export function collectQuietNotifyEvents(
  trades: TradeVerificationResult[],
  state: QuietNotifyState,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): QuietNotifyEvent[] {
  if (!state.enabled) {
    return [];
  }
  const events: QuietNotifyEvent[] = [];
  for (const trade of trades) {
    if (isOrderMuted(state, trade.orderId)) {
      continue;
    }
    const event = buildQuietNotifyEvent(trade, locale);
    if (!event) {
      continue;
    }
    if (state.fingerprints[trade.orderId] === event.fingerprint) {
      continue;
    }
    events.push(event);
  }
  return events.sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
  );
}

export function shouldThrottleNotify(
  state: QuietNotifyState,
  nowMs = Date.now(),
): boolean {
  if (!state.lastNotifyAt) {
    return false;
  }
  const last = Date.parse(state.lastNotifyAt);
  if (!Number.isFinite(last)) {
    return false;
  }
  return nowMs - last < QUIET_NOTIFY_MIN_INTERVAL_MS;
}

/**
 * Build a quiet plan: none / single / grouped.
 * Grouping prevents spam when several deals flip at once.
 */
export function planQuietNotifications(params: {
  trades: TradeVerificationResult[];
  state: QuietNotifyState;
  nowMs?: number;
  locale?: ExtensionLocale;
}): QuietNotifyPlan {
  const nowMs = params.nowMs ?? Date.now();
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const events = collectQuietNotifyEvents(params.trades, params.state, locale);
  if (events.length === 0) {
    return { type: 'none' };
  }
  if (shouldThrottleNotify(params.state, nowMs)) {
    return { type: 'none' };
  }

  if (events.length < QUIET_NOTIFY_GROUP_THRESHOLD) {
    const event = events[0]!;
    return {
      type: 'single',
      event,
      notificationId: `rip-quiet:${event.orderId}:${event.kind}`,
    };
  }

  const kinds = new Set(events.map((event) => event.kind));
  const title =
    kinds.size === 1 && kinds.has('mismatch')
      ? t('notify.groupMismatch')
      : kinds.size === 1 && kinds.has('confirm_guard')
        ? t('notify.groupGuard')
        : kinds.size === 1 && kinds.has('accept_ready')
          ? t('notify.groupAccept')
          : kinds.size === 1 && kinds.has('new_deal')
            ? t('notify.groupNewDeal')
            : t('notify.groupBody', { count: events.length });

  const message = events
    .slice(0, 3)
    .map((event) => `#${event.orderShortId} · ${event.kind}`)
    .join(' · ');
  const suffix =
    events.length > 3 ? ` · +${events.length - 3}` : '';

  return {
    type: 'group',
    events,
    notificationId: `rip-quiet:group:${nowMs}`,
    title,
    message: `${message}${suffix}`,
    clickUrl: events[0]!.clickUrl,
  };
}

/** Apply fingerprints + timestamp after a plan was shown. */
export function applyQuietNotifyPlan(
  state: QuietNotifyState,
  plan: QuietNotifyPlan,
  nowIso = new Date().toISOString(),
): QuietNotifyState {
  if (plan.type === 'none') {
    return state;
  }
  const fingerprints = { ...state.fingerprints };
  const events = plan.type === 'single' ? [plan.event] : plan.events;
  for (const event of events) {
    fingerprints[event.orderId] = event.fingerprint;
  }
  return {
    ...state,
    fingerprints,
    lastNotifyAt: nowIso,
  };
}

/** Drop fingerprints for orders no longer active. */
export function pruneQuietNotifyFingerprints(
  state: QuietNotifyState,
  activeOrderIds: string[],
): QuietNotifyState {
  const active = new Set(activeOrderIds);
  const fingerprints = Object.fromEntries(
    Object.entries(state.fingerprints).filter(([orderId]) => active.has(orderId)),
  );
  const mutedOrderIds = state.mutedOrderIds.filter((id) => active.has(id));
  return { ...state, fingerprints, mutedOrderIds };
}

export function muteQuietNotifyOrder(
  state: QuietNotifyState,
  orderId: string,
): QuietNotifyState {
  if (state.mutedOrderIds.includes(orderId)) {
    return state;
  }
  return {
    ...state,
    mutedOrderIds: [...state.mutedOrderIds, orderId],
  };
}

export function unmuteQuietNotifyOrder(
  state: QuietNotifyState,
  orderId: string,
): QuietNotifyState {
  return {
    ...state,
    mutedOrderIds: state.mutedOrderIds.filter((id) => id !== orderId),
  };
}

export function setQuietNotifyEnabled(
  state: QuietNotifyState,
  enabled: boolean,
): QuietNotifyState {
  return { ...state, enabled };
}
