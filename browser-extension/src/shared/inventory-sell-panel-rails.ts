/**
 * Sell-panel price orientation rails (Steam / recommended / bid).
 * Honest: never label bid as «моментальная» / instant cash.
 */

import {
  formatUsdFromMinor,
  getDefaultListPriceMinor,
  getRecommendedListPriceMinor,
  parseMinor,
  type InventoryPriceHintLike,
} from './inventory-price-intel.js';

export type SellPanelPriceRailsView = {
  steamLine: string | null;
  medianLine: string | null;
  recommendedLine: string | null;
  recommendedMinor: number | null;
  bidLine: string | null;
  bidMinor: number | null;
  honestyLine: string | null;
};

export function resolveSellPanelPriceRails(
  hint?: InventoryPriceHintLike | null,
): SellPanelPriceRailsView {
  const steam = parseMinor(hint?.steamPriceMinor);
  const median = parseMinor(hint?.steamMedianPriceMinor);
  const recommended =
    parseMinor(hint?.suggestedListMinor) ?? getRecommendedListPriceMinor(hint);
  const bid = parseMinor(hint?.bestBidMinor);
  const bidQty =
    hint?.bestBidQuantity != null &&
    Number.isFinite(hint.bestBidQuantity) &&
    hint.bestBidQuantity > 0
      ? Math.floor(hint.bestBidQuantity)
      : null;

  const steamLine =
    steam != null ? `Steam (lowest): ${formatUsdFromMinor(steam)}` : null;
  const medianLine =
    median != null && median !== steam
      ? `Средняя Steam: ${formatUsdFromMinor(median)}`
      : null;
  const recommendedLine =
    recommended != null
      ? `Рекомендуем: ${formatUsdFromMinor(recommended)} (Steam −5% / подсказка R.I.P)`
      : null;
  const bidLine =
    bid != null
      ? bidQty != null && bidQty > 1
        ? `Спрос (bid): ${formatUsdFromMinor(bid)} · ${bidQty} шт`
        : `Спрос (bid): ${formatUsdFromMinor(bid)}`
      : null;

  return {
    steamLine,
    medianLine,
    recommendedLine,
    recommendedMinor: recommended,
    bidLine,
    bidMinor: bid,
    honestyLine: bidLine
      ? 'По bid — уведомление покупателю, не мгновенная выплата.'
      : null,
  };
}

export function resolveSellPanelDefaultPriceMinor(
  hint?: InventoryPriceHintLike | null,
  fallbackMinor?: number | null,
): number | null {
  if (fallbackMinor != null && fallbackMinor > 0) {
    return fallbackMinor;
  }
  return getDefaultListPriceMinor(hint);
}
