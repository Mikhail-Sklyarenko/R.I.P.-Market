import { catalogLotMatchesWearFloatFilters } from './catalog-lot-filters.util';
import type { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';
import { deriveBaseMarketHashName } from '../item-definitions/base-market-hash-name.util';
import {
  lotWearMatchesMarketHashName,
  resolveSteamMarketHashName,
} from '../lots/steam-market-link.util';

export type CatalogLotAggregateRow = {
  id: string;
  priceMinor: bigint;
  createdAt: Date;
  inventoryAsset: {
    itemDefinitionId: string;
    wear: string | null;
    floatValue: { toString(): string } | number | string | null;
    itemDefinition: {
      baseMarketHashName: string | null;
      marketHashName: string;
    };
  };
  listingSnapshot: {
    wear: string | null;
    floatValue: { toString(): string } | number | string | null;
    marketHashName: string | null;
  } | null;
};

export type LotStatEntry = {
  minPriceMinor: bigint;
  count: number;
  latestListedAt: Date | null;
};

export type CatalogLotAggregates = {
  lotStats: Map<string, LotStatEntry>;
  featuredLots: Map<string, string>;
};

function catalogBaseKey(baseMarketHashName: string): string {
  return `base:${baseMarketHashName}`;
}

function bumpLotStat(
  map: Map<string, LotStatEntry>,
  key: string,
  priceMinor: bigint,
  listedAt: Date,
): void {
  const current = map.get(key);
  if (!current) {
    map.set(key, { minPriceMinor: priceMinor, count: 1, latestListedAt: listedAt });
    return;
  }
  current.count += 1;
  if (priceMinor < current.minPriceMinor) {
    current.minPriceMinor = priceMinor;
  }
  if (!current.latestListedAt || listedAt > current.latestListedAt) {
    current.latestListedAt = listedAt;
  }
}

function shouldFeatureLot(lot: CatalogLotAggregateRow): boolean {
  const wear = lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear;
  const marketHashName =
    lot.listingSnapshot?.marketHashName ??
    lot.inventoryAsset.itemDefinition.marketHashName;
  const itemDefinitionName = lot.inventoryAsset.itemDefinition.marketHashName;

  return (
    lotWearMatchesMarketHashName(itemDefinitionName, wear) &&
    resolveSteamMarketHashName(marketHashName, wear) ===
      resolveSteamMarketHashName(itemDefinitionName, wear)
  );
}

/**
 * One pass over active lots: price/count stats plus cheapest featured lot id.
 * Lots must already be ordered by price ascending for featured picks.
 */
export function buildCatalogLotAggregates(
  lots: CatalogLotAggregateRow[],
  query: Pick<ListCatalogItemsQueryDto, 'wear' | 'floatMin' | 'floatMax'>,
): CatalogLotAggregates {
  const lotStats = new Map<string, LotStatEntry>();
  const featuredLots = new Map<string, string>();

  for (const lot of lots) {
    if (!catalogLotMatchesWearFloatFilters(lot as never, query)) {
      continue;
    }

    const def = lot.inventoryAsset.itemDefinition;
    const itemDefinitionId = lot.inventoryAsset.itemDefinitionId;
    const baseKey =
      def.baseMarketHashName ?? deriveBaseMarketHashName(def.marketHashName);
    const baseMapKey = catalogBaseKey(baseKey);

    bumpLotStat(lotStats, itemDefinitionId, lot.priceMinor, lot.createdAt);
    if (baseKey) {
      bumpLotStat(lotStats, baseMapKey, lot.priceMinor, lot.createdAt);
    }

    if (!shouldFeatureLot(lot)) {
      continue;
    }
    if (!featuredLots.has(itemDefinitionId)) {
      featuredLots.set(itemDefinitionId, lot.id);
    }
    if (!featuredLots.has(baseMapKey)) {
      featuredLots.set(baseMapKey, lot.id);
    }
  }

  return { lotStats, featuredLots };
}

export function catalogLotAggregatesCacheKey(
  query: Pick<ListCatalogItemsQueryDto, 'wear' | 'floatMin' | 'floatMax'>,
  baseNames?: string[],
): string {
  return JSON.stringify({
    wear: query.wear ?? null,
    floatMin: query.floatMin ?? null,
    floatMax: query.floatMax ?? null,
    baseNames: baseNames?.length ? [...baseNames].sort() : null,
  });
}

export function catalogIndexCacheKey(
  query: ListCatalogItemsQueryDto,
): string {
  const inStockOnly = query.inStock === 'true' || query.inStock === '1';
  return JSON.stringify({
    q: query.q ?? null,
    marketHashName: query.marketHashName ?? null,
    weapon: query.weapon ?? null,
    rarity: query.rarity ?? null,
    wear: query.wear ?? null,
    floatMin: query.floatMin ?? null,
    floatMax: query.floatMax ?? null,
    minPriceMinor: query.minPriceMinor ?? null,
    maxPriceMinor: query.maxPriceMinor ?? null,
    sort: query.sort ?? 'newest',
    stattrak: query.stattrak ?? null,
    souvenir: query.souvenir ?? null,
    inStock: inStockOnly,
  });
}

export function catalogDefinitionsCacheKey(
  query: ListCatalogItemsQueryDto,
): string {
  return JSON.stringify({
    q: query.q ?? null,
    marketHashName: query.marketHashName ?? null,
    weapon: query.weapon ?? null,
    rarity: query.rarity ?? null,
    stattrak: query.stattrak ?? null,
    souvenir: query.souvenir ?? null,
  });
}
