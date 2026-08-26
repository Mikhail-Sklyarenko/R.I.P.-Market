/**
 * I2: Suggested list price for R.I.P overlays / inventory sell.
 * Keep in sync with browser-extension `inventory-price-intel` and site sell autofill.
 */

import {
  buildPricingPreview,
  calculateCommissionMinor,
  calculateSellerReceiveMinor,
} from '../lots/lot-pricing.util';

export const STEAM_LIST_DISCOUNT = 0.95;

export type SuggestedListSource = 'bid' | 'steam_discount' | null;

export type SuggestedListPriceInput = {
  steamPriceMinor?: number | null;
  bestBidMinor?: string | number | null;
};

export type SuggestedListPrice = {
  suggestedListMinor: number | null;
  suggestedListSource: SuggestedListSource;
  commissionMinor: number | null;
  sellerReceiveMinor: number | null;
};

function parseMinor(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
}

/** Steam guide −5% — same as site inventory sell autofill. */
export function steamDiscountListMinor(
  steamPriceMinor: number | null | undefined,
): number | null {
  if (!steamPriceMinor || steamPriceMinor <= 0) {
    return null;
  }
  return Math.round(steamPriceMinor * STEAM_LIST_DISCOUNT);
}

/**
 * Default list for one-click / overlay: prefer best open bid, else Steam −5%.
 */
export function resolveSuggestedListPrice(
  input: SuggestedListPriceInput,
): SuggestedListPrice {
  const bid = parseMinor(input.bestBidMinor);
  if (bid != null) {
    const preview = buildPricingPreview(bid);
    return {
      suggestedListMinor: preview.priceMinor,
      suggestedListSource: 'bid',
      commissionMinor: preview.commissionMinor,
      sellerReceiveMinor: preview.sellerReceiveMinor,
    };
  }

  const fromSteam = steamDiscountListMinor(input.steamPriceMinor);
  if (fromSteam == null) {
    return {
      suggestedListMinor: null,
      suggestedListSource: null,
      commissionMinor: null,
      sellerReceiveMinor: null,
    };
  }

  const preview = buildPricingPreview(fromSteam);
  return {
    suggestedListMinor: preview.priceMinor,
    suggestedListSource: 'steam_discount',
    commissionMinor: preview.commissionMinor,
    sellerReceiveMinor: preview.sellerReceiveMinor,
  };
}

export { calculateCommissionMinor, calculateSellerReceiveMinor, buildPricingPreview };
