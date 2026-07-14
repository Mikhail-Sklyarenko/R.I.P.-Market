import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

export const ACTIVE_TRADES_CACHE_KEY = 'rip:activeTradesCache';
export const TRADE_ACK_ENABLED_KEY = 'extensionTradeAcknowledgmentEnabled';
export const UI_TRADE_FLOW_ENABLED_KEY = 'extensionUiTradeFlowEnabled';
export const USE_DIRECT_TRADE_API_KEY = 'USE_DIRECT_TRADE_API';

export type ActiveTradesCache = {
  updatedAt: string;
  trades: TradeVerificationResult[];
};

export async function getActiveTradesCache(): Promise<ActiveTradesCache | null> {
  const stored = await chrome.storage.session.get(ACTIVE_TRADES_CACHE_KEY);
  const cache = stored[ACTIVE_TRADES_CACHE_KEY] as ActiveTradesCache | undefined;
  return cache ?? null;
}

export async function setActiveTradesCache(
  trades: TradeVerificationResult[],
): Promise<void> {
  const cache: ActiveTradesCache = {
    updatedAt: new Date().toISOString(),
    trades,
  };
  await chrome.storage.session.set({ [ACTIVE_TRADES_CACHE_KEY]: cache });
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
      kind === 'confirm_sent' ||
      kind === 'confirm_received' ||
      kind === 'report_issue'
    );
  }).length;
}
