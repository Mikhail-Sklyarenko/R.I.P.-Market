/**
 * E1: Popup Home dashboard — daily ops center view model.
 * Connection (site + Steam) · action-required queue · rest of active deals.
 * H1: badges / connection / role labels follow extension locale.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildBuyerInboxCard,
  partitionActiveTrades,
  type BuyerInboxCard,
} from './buyer-inbox.js';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import {
  resolveHealthNextAction,
  resolveTradeNextAction,
  type ResolvedNextAction,
} from './popup-next-action.js';
import type { SessionHealth } from './session-health.js';
import {
  buildRecentReceipts,
  type PostTradeReceiptView,
} from './post-trade-receipt.js';

export type ConnectionTone = 'ok' | 'warn' | 'error' | 'off';

export type ConnectionDashboard = {
  tone: ConnectionTone;
  title: string;
  detail: string;
  siteConnected: boolean;
  steamAligned: boolean;
  steamLabel: string;
};

export type ActionRequiredKind =
  | 're_pair'
  | 'steam_login'
  | 'steam_mismatch'
  | 'inventory_issue'
  | 'confirm_guard'
  | 'accept_offer'
  | 'mismatch'
  | 'send_manual'
  | 'confirm_sent'
  | 'confirm_received'
  | 'report_issue';

export type ActionRequiredItem = {
  id: string;
  kind: ActionRequiredKind;
  priority: number;
  tone: 'warn' | 'error' | 'info';
  badge: string;
  title: string;
  description: string;
  roleLabel: string | null;
  orderId: string | null;
  orderShortId: string | null;
  offerId: string | null;
  itemName: string | null;
  amountMinor: string | null;
  /** E2: single primary + overflow. */
  cta: ResolvedNextAction;
};

export type HomeDashboard = {
  connection: ConnectionDashboard;
  actionItems: ActionRequiredItem[];
  buyers: BuyerInboxCard[];
  sellers: TradeVerificationResult[];
  /** G3: recent COMPLETED deal receipts. */
  receipts: PostTradeReceiptView[];
  counts: {
    action: number;
    buyers: number;
    sellers: number;
    receipts: number;
    total: number;
  };
  emptyHome: boolean;
};

const ACTION_KIND_PRIORITY: Record<ActionRequiredKind, number> = {
  re_pair: 0,
  steam_mismatch: 1,
  steam_login: 2,
  mismatch: 3,
  report_issue: 3,
  confirm_guard: 4,
  accept_offer: 5,
  send_manual: 6,
  confirm_sent: 7,
  confirm_received: 8,
  inventory_issue: 9,
};

function actionBadge(
  kind: ActionRequiredKind,
  locale: ExtensionLocale,
): string {
  const t = createExtensionT(locale);
  switch (kind) {
    case 're_pair':
      return t('badge.rePair');
    case 'steam_login':
    case 'steam_mismatch':
      return t('badge.steam');
    case 'inventory_issue':
      return t('badge.inventory');
    case 'confirm_guard':
      return t('badge.guard');
    case 'accept_offer':
      return t('badge.accept');
    case 'mismatch':
      return t('badge.mismatch');
    case 'send_manual':
      return t('badge.sendManual');
    case 'confirm_sent':
      return t('badge.confirmSent');
    case 'confirm_received':
      return t('badge.confirmReceived');
    case 'report_issue':
      return t('badge.reportIssue');
  }
}

export function isTradeActionRequired(
  trade: Pick<TradeVerificationResult, 'verificationStatus' | 'nextAction'>,
): boolean {
  if (trade.verificationStatus === 'mismatch') {
    return true;
  }
  const kind = trade.nextAction.kind;
  return (
    kind === 'accept_in_steam' ||
    kind === 'confirm_guard' ||
    kind === 'send_manual' ||
    kind === 'confirm_sent' ||
    kind === 'confirm_received' ||
    kind === 'report_issue'
  );
}

export function resolveConnectionDashboard(params: {
  connected: boolean;
  expiresAt?: string | null;
  health: SessionHealth | null;
  locale?: ExtensionLocale;
}): ConnectionDashboard {
  const health = params.health;
  const siteConnected = params.connected;
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);

  if (!siteConnected) {
    const revoked = health?.code === 'SESSION_REVOKED';
    return {
      tone: 'off',
      title: revoked ? t('connection.revokedTitle') : t('connection.offTitle'),
      detail: revoked
        ? t('connection.revokedDetail')
        : t('connection.offDetail'),
      siteConnected: false,
      steamAligned: false,
      steamLabel: t('connection.steamUnknown'),
    };
  }

  if (health?.code === 'STEAM_ACCOUNT_MISMATCH') {
    return {
      tone: 'error',
      title: t('connection.mismatchTitle'),
      detail: health.message,
      siteConnected: true,
      steamAligned: false,
      steamLabel: t('connection.mismatchDetail'),
    };
  }

  if (health?.code === 'STEAM_COOKIE_EXPIRED') {
    return {
      tone: 'error',
      title: t('connection.noSteamTitle'),
      detail: health.message,
      siteConnected: true,
      steamAligned: false,
      steamLabel: t('connection.noSteamDetail'),
    };
  }

  if (
    health?.code === 'INVENTORY_PRIVATE' ||
    health?.code === 'INVENTORY_RATE_LIMITED' ||
    health?.code === 'INVENTORY_NOT_LOADED'
  ) {
    const expires = formatExpires(params.expiresAt);
    return {
      tone: 'warn',
      title: expires
        ? t('connection.connectedUntil', { expires })
        : t('connection.connectedOkTitle'),
      detail: health.message,
      siteConnected: true,
      steamAligned: true,
      steamLabel: t('connection.inventoryIssueTitle'),
    };
  }

  const expires = formatExpires(params.expiresAt);
  return {
    tone: 'ok',
    title: expires
      ? t('connection.connectedUntil', { expires })
      : t('connection.connectedTitle'),
    detail: t('connection.connectedDetail'),
    siteConnected: true,
    steamAligned: true,
    steamLabel: t('connection.steamAligned'),
  };
}

function formatExpires(expiresAt?: string | null): string | null {
  if (!expiresAt) {
    return null;
  }
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) {
    return null;
  }
  try {
    return new Date(ms).toLocaleTimeString();
  } catch {
    return null;
  }
}

export function buildHealthActionItem(
  health: SessionHealth | null,
  connected: boolean,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ActionRequiredItem | null {
  if (!health || health.code === 'OK') {
    return null;
  }

  const cta = resolveHealthNextAction(health, locale);
  const base = {
    title: health.title,
    description: health.message,
    roleLabel: null as string | null,
    orderId: null as string | null,
    orderShortId: null as string | null,
    offerId: null as string | null,
    itemName: null as string | null,
    amountMinor: null as string | null,
    cta,
  };

  if (!connected || health.code === 'EXT_DISCONNECTED' || health.code === 'SESSION_REVOKED') {
    return {
      id: `health:${health.code}`,
      kind: 're_pair',
      priority: ACTION_KIND_PRIORITY.re_pair,
      tone: 'error',
      badge: actionBadge('re_pair', locale),
      ...base,
    };
  }

  if (health.code === 'STEAM_ACCOUNT_MISMATCH') {
    return {
      id: `health:${health.code}`,
      kind: 'steam_mismatch',
      priority: ACTION_KIND_PRIORITY.steam_mismatch,
      tone: 'error',
      badge: actionBadge('steam_mismatch', locale),
      ...base,
    };
  }

  if (health.code === 'STEAM_COOKIE_EXPIRED') {
    return {
      id: `health:${health.code}`,
      kind: 'steam_login',
      priority: ACTION_KIND_PRIORITY.steam_login,
      tone: 'error',
      badge: actionBadge('steam_login', locale),
      ...base,
    };
  }

  return {
    id: `health:${health.code}`,
    kind: 'inventory_issue',
    priority: ACTION_KIND_PRIORITY.inventory_issue,
    tone: 'warn',
    badge: actionBadge('inventory_issue', locale),
    ...base,
  };
}

function resolveTradeActionKind(
  trade: TradeVerificationResult,
): ActionRequiredKind {
  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue'
  ) {
    return trade.verificationStatus === 'mismatch' ? 'mismatch' : 'report_issue';
  }
  switch (trade.nextAction.kind) {
    case 'confirm_guard':
      return 'confirm_guard';
    case 'accept_in_steam':
      return 'accept_offer';
    case 'send_manual':
      return 'send_manual';
    case 'confirm_sent':
      return 'confirm_sent';
    case 'confirm_received':
      return 'confirm_received';
    default:
      return 'report_issue';
  }
}

export function buildTradeActionItem(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ActionRequiredItem | null {
  if (trade.nextAction.kind === 'completed') {
    return null;
  }
  if (!isTradeActionRequired(trade)) {
    return null;
  }

  const t = createExtensionT(locale);
  const kind = resolveTradeActionKind(trade);
  const tone: ActionRequiredItem['tone'] =
    kind === 'mismatch' || kind === 'report_issue'
      ? 'error'
      : kind === 'confirm_guard' || kind === 'accept_offer' || kind === 'send_manual'
        ? 'warn'
        : 'info';

  return {
    id: `trade:${trade.orderId}:${kind}`,
    kind,
    priority: ACTION_KIND_PRIORITY[kind],
    tone,
    badge: actionBadge(kind, locale),
    title: trade.nextAction.title,
    description: trade.nextAction.description,
    roleLabel: trade.role === 'buyer' ? t('common.buy') : t('common.sell'),
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    offerId: trade.offerId,
    itemName: trade.item.marketHashName,
    amountMinor: trade.amountMinor,
    cta: resolveTradeNextAction(trade, locale),
  };
}

export function sortActionRequiredItems(
  items: ActionRequiredItem[],
): ActionRequiredItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return (a.orderShortId ?? a.id).localeCompare(b.orderShortId ?? b.id);
  });
}

export function buildActionRequiredQueue(params: {
  connected: boolean;
  health: SessionHealth | null;
  trades: TradeVerificationResult[];
  locale?: ExtensionLocale;
}): ActionRequiredItem[] {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const items: ActionRequiredItem[] = [];
  const healthItem = buildHealthActionItem(
    params.health,
    params.connected,
    locale,
  );
  if (healthItem) {
    items.push(healthItem);
  }
  for (const trade of params.trades) {
    const item = buildTradeActionItem(trade, locale);
    if (item) {
      items.push(item);
    }
  }
  return sortActionRequiredItems(items);
}

/**
 * Build the full home dashboard. Actionable deals appear only in the
 * action queue; purchase/sale lists keep the rest (wait / verifying).
 */
export function buildHomeDashboard(params: {
  connected: boolean;
  expiresAt?: string | null;
  health: SessionHealth | null;
  trades: TradeVerificationResult[];
  locale?: ExtensionLocale;
}): HomeDashboard {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const connection = resolveConnectionDashboard({
    connected: params.connected,
    expiresAt: params.expiresAt,
    health: params.health,
    locale,
  });
  const actionItems = buildActionRequiredQueue({
    connected: params.connected,
    health: params.health,
    trades: params.trades,
    locale,
  });
  const actionOrderIds = new Set(
    actionItems
      .map((item) => item.orderId)
      .filter((id): id is string => Boolean(id)),
  );

  const restTrades = params.trades.filter(
    (trade) =>
      trade.nextAction.kind !== 'completed' &&
      trade.orderStatus !== 'COMPLETED' &&
      !actionOrderIds.has(trade.orderId),
  );
  const { buyers: buyerTrades, sellers } = partitionActiveTrades(restTrades);
  const buyers = buyerTrades
    .map((trade) => buildBuyerInboxCard(trade, locale))
    .filter((card): card is BuyerInboxCard => card !== null);

  const receipts = buildRecentReceipts(params.trades, locale);

  const totalActive = params.trades.filter(
    (trade) =>
      trade.nextAction.kind !== 'completed' && trade.orderStatus !== 'COMPLETED',
  ).length;

  return {
    connection,
    actionItems,
    buyers,
    sellers,
    receipts,
    counts: {
      action: actionItems.length,
      buyers: buyers.length,
      sellers: sellers.length,
      receipts: receipts.length,
      total: totalActive,
    },
    emptyHome:
      params.connected &&
      actionItems.length === 0 &&
      buyers.length === 0 &&
      sellers.length === 0 &&
      receipts.length === 0 &&
      (params.health?.code === 'OK' || !params.health),
  };
}
