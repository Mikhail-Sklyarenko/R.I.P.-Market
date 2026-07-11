import type { InventoryPriceHint } from '../api/types';

const STEAM_DISCOUNT = 0.95;

export function getRecommendedPriceMinor(
  hint?: InventoryPriceHint | null,
): number | null {
  if (!hint) {
    return null;
  }
  if (hint.minMarketplacePriceMinor) {
    const marketMinor = Number(hint.minMarketplacePriceMinor);
    return Number.isFinite(marketMinor) && marketMinor > 0 ? marketMinor : null;
  }
  if (hint.steamPriceMinor && hint.steamPriceMinor > 0) {
    return Math.round(hint.steamPriceMinor * STEAM_DISCOUNT);
  }
  return null;
}

export function getRecommendedPriceSource(
  hint?: InventoryPriceHint | null,
): 'market' | 'steam' | null {
  if (!hint) {
    return null;
  }
  if (hint.minMarketplacePriceMinor) {
    return 'market';
  }
  if (hint.steamPriceMinor && hint.steamPriceMinor > 0) {
    return 'steam';
  }
  return null;
}

export function minorToPriceInput(minor: number): string {
  return (minor / 100).toFixed(2);
}
