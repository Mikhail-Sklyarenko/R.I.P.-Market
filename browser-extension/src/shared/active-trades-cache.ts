import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

export const ACTIVE_TRADES_CACHE_KEY = 'rip:activeTradesCache';
/** H4: survives service-worker restarts while site is unreachable. */
export const ACTIVE_TRADES_DURABLE_CACHE_KEY = 'rip:activeTradesDurable';
export const TRADE_ACK_ENABLED_KEY = 'extensionTradeAcknowledgmentEnabled';
export const UI_TRADE_FLOW_ENABLED_KEY = 'extensionUiTradeFlowEnabled';
/** I5: Steam inventory overlays / one-click sell. Missing key = on. */
export const INVENTORY_LAYER_ENABLED_KEY = 'extensionInventoryLayerEnabled';
/** I5: guided buyer accept (wizard + Steam assists). Missing key = on. */
export const GUIDED_BUYER_ENABLED_KEY = 'extensionGuidedBuyerEnabled';
/** I5: quiet Chrome notifications. Missing key = on. */
export const QUIET_NOTIFICATIONS_ENABLED_KEY =
  'extensionQuietNotificationsEnabled';
export const USE_DIRECT_TRADE_API_KEY = 'USE_DIRECT_TRADE_API';

/** H2: serve cache without network when fresher than this. */
export const ACTIVE_TRADES_CACHE_TTL_MS = 20_000;

export type ActiveTradesCache = {
  updatedAt: string;
  trades: TradeVerificationResult[];
};

export function isActiveTradesCacheFresh(
  cache: ActiveTradesCache | null | undefined,
  nowMs = Date.now(),
  ttlMs = ACTIVE_TRADES_CACHE_TTL_MS,
): boolean {
  if (!cache?.updatedAt) {
    return false;
  }
  const updated = Date.parse(cache.updatedAt);
  if (!Number.isFinite(updated)) {
    return false;
  }
  return nowMs - updated < ttlMs;
}

function parseCache(raw: unknown): ActiveTradesCache | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Partial<ActiveTradesCache>;
  if (typeof record.updatedAt !== 'string' || !Array.isArray(record.trades)) {
    return null;
  }
  return {
    updatedAt: record.updatedAt,
    trades: record.trades as TradeVerificationResult[],
  };
}

export async function getActiveTradesCache(): Promise<ActiveTradesCache | null> {
  const sessionStored = await chrome.storage.session.get(ACTIVE_TRADES_CACHE_KEY);
  const sessionCache = parseCache(sessionStored[ACTIVE_TRADES_CACHE_KEY]);
  if (sessionCache) {
    return sessionCache;
  }
  const durableStored = await chrome.storage.local.get(
    ACTIVE_TRADES_DURABLE_CACHE_KEY,
  );
  return parseCache(durableStored[ACTIVE_TRADES_DURABLE_CACHE_KEY]);
}

export async function setActiveTradesCache(
  trades: TradeVerificationResult[],
): Promise<void> {
  const cache: ActiveTradesCache = {
    updatedAt: new Date().toISOString(),
    trades,
  };
  await Promise.all([
    chrome.storage.session.set({ [ACTIVE_TRADES_CACHE_KEY]: cache }),
    chrome.storage.local.set({ [ACTIVE_TRADES_DURABLE_CACHE_KEY]: cache }),
  ]);
}

export async function isTradeAcknowledgmentEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(TRADE_ACK_ENABLED_KEY);
  return stored[TRADE_ACK_ENABLED_KEY] === true;
}

export function findTradeByOfferId(
  trades: TradeVerificationResult[],
  offerId: string,
): TradeVerificationResult | undefined {
  return trades.find((trade) => trade.offerId === offerId);
}

export function countActionableTrades(trades: TradeVerificationResult[]): number {
  return trades.filter((trade) => {
    const kind = trade.nextAction.kind;
    return (
      kind === 'accept_in_steam' ||
      kind === 'confirm_guard' ||
      kind === 'send_manual' ||
      kind === 'confirm_sent' ||
      kind === 'confirm_received' ||
      kind === 'report_issue'
    );
  }).length;
}
