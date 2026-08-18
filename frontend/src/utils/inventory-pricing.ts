import type { InventoryPriceHint } from '../api/types';

const STEAM_DISCOUNT = 0.95;

/**
 * Listing suggestion for sellers: always Steam −5%.
 * Marketplace min is competition context only — never the recommended list price
 * (avoids outliers like $10 lots on $0.03 Steam skins).
 */
export function getRecommendedPriceMinor(
  hint?: InventoryPriceHint | null,
): number | null {
  if (!hint?.steamPriceMinor || hint.steamPriceMinor <= 0) {
    return null;
  }
  return Math.round(hint.steamPriceMinor * STEAM_DISCOUNT);
}

export function getRecommendedPriceSource(
  hint?: InventoryPriceHint | null,
): 'steam' | null {
  if (!hint?.steamPriceMinor || hint.steamPriceMinor <= 0) {
    return null;
  }
  return 'steam';
}

export function minorToPriceInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Fill Steam −5% only for a new listing the seller has not typed into yet. */
export function shouldAutofillListingPrice(options: {
  mode: 'create' | 'edit';
  priceDirty: boolean;
  currentInput: string;
  recommendedMinor: number | null;
}): boolean {
  if (options.mode !== 'create' || options.priceDirty) {
    return false;
  }
  if (options.recommendedMinor == null || options.recommendedMinor <= 0) {
    return false;
  }
  return options.currentInput.trim() === '';
}
