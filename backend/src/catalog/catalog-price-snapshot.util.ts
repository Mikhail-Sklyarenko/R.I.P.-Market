import { deriveBaseMarketHashName } from '../item-definitions/base-market-hash-name.util';

export type BulkPriceSnapshotItem = {
  market_hash_name?: string;
  price?: string | number;
};

export type BulkPriceSnapshotResponse = {
  success?: boolean;
  items?: BulkPriceSnapshotItem[];
};

export function parseBulkSnapshotItems(
  items: BulkPriceSnapshotItem[] | null | undefined,
  parseUsdToMinor: (value?: string | number) => number | null,
): Map<string, number> {
  const prices = new Map<string, number>();
  if (!items?.length) {
    return prices;
  }

  for (const item of items) {
    const name = item.market_hash_name?.trim();
    if (!name) {
      continue;
    }
    const priceMinor = parseUsdToMinor(item.price);
    if (priceMinor != null) {
      prices.set(name, priceMinor);
    }
  }

  return prices;
}

/**
 * For catalog skin cards (base name without wear), pick the lowest listed wear price.
 */
export function aggregateMinPriceByBaseName(
  snapshotPrices: Map<string, number>,
): Map<string, number> {
  const byBase = new Map<string, number>();

  for (const [marketHashName, priceMinor] of snapshotPrices) {
    const base = deriveBaseMarketHashName(marketHashName);
    const existing = byBase.get(base);
    if (existing === undefined || priceMinor < existing) {
      byBase.set(base, priceMinor);
    }
  }

  return byBase;
}

export function resolveCatalogSteamPriceMinor(
  catalogMarketHashName: string,
  snapshotPrices: Map<string, number>,
  basePrices: Map<string, number>,
): number | null {
  const exact = snapshotPrices.get(catalogMarketHashName);
  if (exact != null) {
    return exact;
  }
  return basePrices.get(catalogMarketHashName) ?? null;
}
