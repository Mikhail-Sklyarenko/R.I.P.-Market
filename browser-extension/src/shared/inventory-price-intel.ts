/**
 * D3: R.I.P price intelligence for Steam inventory cards.
 * D5: best open buy-request (bid) as demand signal — list-at-bid, not fake instant cash.
 * Primary = platform signal; Steam guide is secondary; net = after 5% commission
 * (mirrors backend `buildPricingPreview` / lots pricing-preview).
 */

export type InventoryPriceHintLike = {
  steamPriceMinor?: number | null;
  steamMedianPriceMinor?: number | null;
  minMarketplacePriceMinor?: string | number | null;
  buffPriceMinor?: number | null;
  csfloatPriceMinor?: number | null;
  bestBidMinor?: string | number | null;
  bestBidQuantity?: number | null;
  /** I2: server-computed suggested list (bid ?? Steam −5%). */
  suggestedListMinor?: number | null;
  suggestedListSource?: 'bid' | 'steam_discount' | null;
  commissionMinor?: number | null;
  sellerReceiveMinor?: number | null;
};

export type InventoryPriceIntelView = {
  /** Suggested list price on R.I.P (best bid if any, else Steam −5%), or listed price. */
  recommendedListMinor: number | null;
  /** Lowest active ask on R.I.P for this market hash name. */
  ripMinAskMinor: number | null;
  steamGuideMinor: number | null;
  /** Best open buy-request bid (notify-match demand). */
  bestBidMinor: number | null;
  bestBidQuantity: number | null;
  /** Seller receive after 5% platform fee on the list/recommended price. */
  sellerReceiveMinor: number | null;
  /** Verbose primary (sell panel / accessibility). */
  primaryLine: string | null;
  /** Quiet grid: amount only, no brand prefix. */
  compactPrimaryLine: string | null;
  secondaryLine: string | null;
  netLine: string | null;
  /** Compact bid chip for overlay (honest demand, not “instant sell”). */
  bidLine: string | null;
};

const STEAM_LIST_DISCOUNT = 0.95;
const PLATFORM_COMMISSION_RATE = 0.05;

export function calculateCommissionMinor(priceMinor: number): number {
  return Math.floor(priceMinor * PLATFORM_COMMISSION_RATE);
}

export function calculateSellerReceiveMinor(priceMinor: number): number {
  return priceMinor - calculateCommissionMinor(priceMinor);
}

/** Listing suggestion: Steam guide −5% (same as site inventory sell panel). */
export function getRecommendedListPriceMinor(
  hint?: InventoryPriceHintLike | null,
): number | null {
  const steam = hint?.steamPriceMinor;
  if (!steam || steam <= 0) {
    return null;
  }
  return Math.round(steam * STEAM_LIST_DISCOUNT);
}

export function parseMinor(
  value: string | number | null | undefined,
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

export function formatUsdFromMinor(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/**
 * Default list price for one-click sell:
 * prefer server I2 suggestion, else best bid, else Steam−5%.
 */
export function getDefaultListPriceMinor(
  hint?: InventoryPriceHintLike | null,
): number | null {
  const serverSuggested = parseMinor(hint?.suggestedListMinor);
  if (serverSuggested != null) {
    return serverSuggested;
  }
  const bid = parseMinor(hint?.bestBidMinor);
  if (bid != null) {
    return bid;
  }
  return getRecommendedListPriceMinor(hint);
}

/**
 * Compact price strip for CS2 inventory overlays.
 * - Primary: listed price, else R.I.P recommended (Steam−5%) / bid-aware default
 * - Secondary: Steam guide + “на R.I.P от …” when marketplace min exists
 * - Bid line: honest “bid $X” when buy-request demand exists
 * - Net: «вам ~$X» after commission on primary list price
 */
export function resolveInventoryPriceIntel(params: {
  hint?: InventoryPriceHintLike | null;
  listedPriceMinor?: string | number | null;
}): InventoryPriceIntelView {
  const steamGuideMinor = parseMinor(params.hint?.steamPriceMinor);
  const ripMinAskMinor = parseMinor(params.hint?.minMarketplacePriceMinor);
  const listedMinor = parseMinor(params.listedPriceMinor);
  const bestBidMinor = parseMinor(params.hint?.bestBidMinor);
  const bestBidQuantity =
    params.hint?.bestBidQuantity != null &&
    Number.isFinite(params.hint.bestBidQuantity) &&
    params.hint.bestBidQuantity > 0
      ? Math.floor(params.hint.bestBidQuantity)
      : bestBidMinor != null
        ? 1
        : null;
  const recommendedListMinor = getRecommendedListPriceMinor(params.hint);
  const defaultListMinor = getDefaultListPriceMinor(params.hint);
  const listMinor = listedMinor ?? defaultListMinor;
  const sellerReceiveMinor =
    listMinor != null ? calculateSellerReceiveMinor(listMinor) : null;

  let primaryLine: string | null = null;
  let compactPrimaryLine: string | null = null;
  if (listedMinor != null) {
    primaryLine = `R.I.P ${formatUsdFromMinor(listedMinor)}`;
    compactPrimaryLine = formatUsdFromMinor(listedMinor);
  } else if (bestBidMinor != null) {
    primaryLine = `Bid ${formatUsdFromMinor(bestBidMinor)}`;
    compactPrimaryLine = `Bid ${formatUsdFromMinor(bestBidMinor)}`;
  } else if (recommendedListMinor != null) {
    primaryLine = `R.I.P ~${formatUsdFromMinor(recommendedListMinor)}`;
    compactPrimaryLine = `~${formatUsdFromMinor(recommendedListMinor)}`;
  } else if (ripMinAskMinor != null) {
    primaryLine = `R.I.P от ${formatUsdFromMinor(ripMinAskMinor)}`;
    compactPrimaryLine = `от ${formatUsdFromMinor(ripMinAskMinor)}`;
  }

  const secondaryParts: string[] = [];
  if (steamGuideMinor != null) {
    secondaryParts.push(`Steam ${formatUsdFromMinor(steamGuideMinor)}`);
  }
  if (
    ripMinAskMinor != null &&
    (listedMinor != null || recommendedListMinor != null || bestBidMinor != null)
  ) {
    secondaryParts.push(`на R.I.P от ${formatUsdFromMinor(ripMinAskMinor)}`);
  }
  const secondaryLine =
    secondaryParts.length > 0 ? secondaryParts.join(' · ') : null;

  const netLine =
    sellerReceiveMinor != null
      ? `вам ~${formatUsdFromMinor(sellerReceiveMinor)}`
      : null;

  const bidLine =
    listedMinor == null && bestBidMinor != null
      ? bestBidQuantity != null && bestBidQuantity > 1
        ? `bid ${formatUsdFromMinor(bestBidMinor)} · ×${bestBidQuantity}`
        : `bid ${formatUsdFromMinor(bestBidMinor)}`
      : null;

  return {
    recommendedListMinor,
    ripMinAskMinor,
    steamGuideMinor,
    bestBidMinor,
    bestBidQuantity,
    sellerReceiveMinor,
    primaryLine,
    compactPrimaryLine,
    secondaryLine,
    netLine,
    bidLine,
  };
}

export function chunkMarketHashNames(
  names: string[],
  size = 60,
): string[][] {
  const unique = [...new Set(names.filter((name) => Boolean(name.trim())))];
  if (size < 1) {
    return unique.length ? [unique] : [];
  }
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size));
  }
  return chunks;
}
