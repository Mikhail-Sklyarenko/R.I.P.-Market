/**
 * Honest Steam trade-hold / Trade Protected messaging for inventory overlays.
 */

import type { InventoryItemSteamFacts } from './inventory-item-enrichment.js';
import { isTradeLocked } from './inventory-prelist-safety.js';

export const TRADE_HOLD_BANNER_DISMISS_KEY = 'rip:tradeHoldBannerDismissed';

export type TradeHoldBannerView = {
  visible: boolean;
  title: string;
  body: string;
  holdCount: number;
  dismissLabel: string;
};

/**
 * Human badge for remaining trade hold (not English "Trade-lock").
 */
export function formatTradeHoldBadgeLabel(
  tradeLockUntil: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!tradeLockUntil) {
    return null;
  }
  const until = Date.parse(tradeLockUntil);
  if (!Number.isFinite(until) || until <= nowMs) {
    return null;
  }
  const remainingMs = until - nowMs;
  const days = Math.ceil(remainingMs / 86_400_000);
  if (days <= 1) {
    const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
    return `Hold · ${hours} ч`;
  }
  return `Hold · ${days} дн`;
}

/** Count items on trade hold or otherwise not tradable. */
export function countTradeHoldOrUntradable(
  facts: Iterable<InventoryItemSteamFacts>,
  nowMs = Date.now(),
): number {
  let count = 0;
  for (const fact of facts) {
    if (isTradeLocked(fact.tradeLockUntil, nowMs) || !fact.tradable) {
      count += 1;
    }
  }
  return count;
}

export function resolveTradeHoldBannerView(params: {
  facts: Iterable<InventoryItemSteamFacts>;
  dismissed: boolean;
  nowMs?: number;
}): TradeHoldBannerView {
  const holdCount = countTradeHoldOrUntradable(params.facts, params.nowMs);
  if (params.dismissed || holdCount <= 0) {
    return {
      visible: false,
      title: '',
      body: '',
      holdCount,
      dismissLabel: 'Понятно',
    };
  }
  return {
    visible: true,
    title: 'Часть предметов на Steam trade hold',
    body:
      holdCount === 1
        ? '1 предмет нельзя отправить в обмен, пока Steam не снимет блокировку. На карточке — срок (Hold). Выставить на R.I.P можно только tradable.'
        : `${holdCount} предметов нельзя отправить в обмен, пока Steam не снимет блокировку. На карточках — срок (Hold). Выставить на R.I.P можно только tradable.`,
    holdCount,
    dismissLabel: 'Понятно',
  };
}

export function isTradeHoldBannerDismissed(
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): boolean {
  try {
    return storage.getItem(TRADE_HOLD_BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTradeHoldBanner(
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  try {
    storage.setItem(TRADE_HOLD_BANNER_DISMISS_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export function readSteamItemIconUrl(
  root: ParentNode,
  assetId: string,
  queryItem: (root: ParentNode, assetId: string) => Element | null,
): string | null {
  const item = queryItem(root, assetId);
  if (!item) {
    return null;
  }
  const img =
    item.querySelector<HTMLImageElement>('img[src]') ??
    item.querySelector<HTMLImageElement>('img');
  const src = img?.currentSrc?.trim() || img?.src?.trim() || null;
  if (!src || src.startsWith('data:')) {
    return null;
  }
  return src;
}
