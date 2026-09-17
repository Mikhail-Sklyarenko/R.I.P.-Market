import type { InventoryPriceHint } from '../api/types';

const STEAM_DISCOUNT = 0.95;

function parseSuggestedMinor(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
}

/**
 * Listing suggestion for sellers.
 * Prefer server suggestedListMinor (bid, else Steam −5%); fall back to local Steam −5%.
 * Marketplace min is competition context only — never the recommended list price.
 */
export function getRecommendedPriceMinor(
  hint?: InventoryPriceHint | null,
): number | null {
  const fromServer = parseSuggestedMinor(hint?.suggestedListMinor);
  if (fromServer != null) {
    return fromServer;
  }
  if (!hint?.steamPriceMinor || hint.steamPriceMinor <= 0) {
    return null;
  }
  return Math.round(hint.steamPriceMinor * STEAM_DISCOUNT);
}

export function getRecommendedPriceSource(
  hint?: InventoryPriceHint | null,
): 'bid' | 'steam' | null {
  const fromServer = parseSuggestedMinor(hint?.suggestedListMinor);
  if (fromServer != null) {
    if (hint?.suggestedListSource === 'bid') {
      return 'bid';
    }
    if (hint?.suggestedListSource === 'steam_discount') {
      return 'steam';
    }
    if (parseSuggestedMinor(hint?.bestBidMinor) === fromServer) {
      return 'bid';
    }
    return 'steam';
  }
  if (!hint?.steamPriceMinor || hint.steamPriceMinor <= 0) {
    return null;
  }
  return 'steam';
}

export function minorToPriceInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Fill recommended price only for a new listing the seller has not typed into yet. */
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
