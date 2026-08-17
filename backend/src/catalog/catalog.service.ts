import { HttpStatus, Injectable } from '@nestjs/common';
import { LotStatus, OrderStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_STOCK_WEAPON_MARKET_HASH_NAMES,
  isListableMarketHashName,
  NON_LISTABLE_MARKET_HASH_NAME_FRAGMENTS,
} from '../lots/listing-eligibility.util';
import { ItemIconService } from './item-icon.service';
import { SteamMarketPriceService } from './steam-market-price.service';
import type { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';
import { applyCatalogSkinTraitFilters } from './catalog-skin-trait-filter.util';
import { deriveBaseMarketHashName } from '../item-definitions/base-market-hash-name.util';
import { isUuid } from '../item-definitions/item-slug.util';
import { parseWearIcons } from '../item-definitions/wear-icons.util';
import { resolveCatalogCardDisplaySteamPriceName } from './catalog-steam-price-names.util';
import {
  buildCatalogLotAggregates,
  catalogDefinitionsCacheKey,
  catalogIndexCacheKey,
  catalogLotAggregatesCacheKey,
  type CatalogLotAggregates,
} from './catalog-lot-aggregates.util';
import { TtlLruCache } from './catalog-ttl-cache';

const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CATALOG_INDEX_TTL_MS = 15_000;
const CATALOG_LOT_STATS_TTL_MS = 15_000;
const CATALOG_POPULAR_STATS_TTL_MS = 45_000;
const CATALOG_DEFINITIONS_TTL_MS = 30_000;

export type CatalogItemRow = {
  id: string;
  slug: string | null;
  marketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  wearIcons: Record<string, string>;
  availableWears: string[];
  catalogSeeded: boolean;
  minMarketplacePriceMinor: string | null;
  activeLotCount: number;
  /** ISO timestamp of the newest active listing for this card (base skin aggregation). */
  latestListedAt: string | null;
  orderCount30d: number;
  steamPriceMinor: number | null;
  steamPriceFetchedAt?: string | null;
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  featuredLotId: string | null;
};

function parseAvailableWears(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function catalogBaseKey(baseMarketHashName: string): string {
  return `base:${baseMarketHashName}`;
}

type ItemDefinitionRecord = {
  id: string;
  slug?: string | null;
  marketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  baseMarketHashName?: string | null;
  wearIcons?: unknown;
  availableWears?: unknown;
  catalogSeeded?: boolean;
};

type CatalogListIndex = {
  rows: CatalogItemRow[];
};

@Injectable()
export class CatalogService {
  private readonly catalogIndexCache = new TtlLruCache<CatalogListIndex>(
    24,
    CATALOG_INDEX_TTL_MS,
  );
  private readonly lotAggregatesCache = new TtlLruCache<CatalogLotAggregates>(
    16,
    CATALOG_LOT_STATS_TTL_MS,
  );
  private readonly popularStatsCache = new TtlLruCache<Map<string, number>>(
    4,
    CATALOG_POPULAR_STATS_TTL_MS,
  );
  private readonly definitionsCache = new TtlLruCache<ItemDefinitionRecord[]>(
    16,
    CATALOG_DEFINITIONS_TTL_MS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly steamMarketPrice: SteamMarketPriceService,
    private readonly itemIcons: ItemIconService,
  ) {}

  /** Test helper: keep specs isolated when the service instance is reused. */
  resetQueryCaches(): void {
    this.catalogIndexCache.clear();
    this.lotAggregatesCache.clear();
    this.popularStatsCache.clear();
    this.definitionsCache.clear();
  }

  async listItems(query: ListCatalogItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 48;
    const skip = (page - 1) * limit;

    const index = await this.getCatalogListIndex(query);
    const total = index.rows.length;
    const pageRows = index.rows.slice(skip, skip + limit);
    const hydrated = await this.hydrateRowsWithCachedSteamPrices(pageRows);
    const withIcons = await this.hydrateMissingIconsFromSnapshots(hydrated.rows);
    this.scheduleMissingSteamPriceRefresh(withIcons);
    this.itemIcons.scheduleMissingIconRefresh(withIcons);

    return this.buildListResponse(
      withIcons,
      total,
      page,
      limit,
      hydrated.steamPriceFetchedAt,
    );
  }

  async getItem(ref: string) {
    const item = await this.findItemDefinition(ref);
    if (!item || !isListableMarketHashName(item.marketHashName)) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const baseName =
      item.baseMarketHashName ?? deriveBaseMarketHashName(item.marketHashName);
    const [aggregates, popularStats] = await Promise.all([
      this.loadActiveLotAggregates({}, { baseNames: [baseName] }),
      this.loadPopularStats({ baseNames: [baseName] }),
    ]);
    const steamPrices = await this.steamMarketPrice.getPricesWithMeta(
      [item.marketHashName],
      { cacheOnly: true },
    );

    const row = this.buildCatalogItemRow(
      item,
      aggregates.lotStats,
      popularStats,
      aggregates.featuredLots,
      steamPrices,
      {},
    );
    this.itemIcons.scheduleMissingIconRefresh([row]);

    return toJsonSafe(row);
  }

  async listPopular(limit = 12) {
    const capped = Math.min(Math.max(limit, 1), 24);
    const itemWhere = this.buildItemWhere({});
    const [popularStats, aggregates] = await Promise.all([
      this.loadPopularStats(),
      this.loadActiveLotAggregates({}, {}),
    ]);

    const bases = new Set<string>();
    for (const key of aggregates.lotStats.keys()) {
      if (key.startsWith('base:')) {
        bases.add(key.slice('base:'.length));
      }
    }
    for (const [key, orderCount] of popularStats) {
      if (orderCount > 0 && key.startsWith('base:')) {
        bases.add(key.slice('base:'.length));
      }
    }

    if (bases.size === 0) {
      return [];
    }

    const baseList = [...bases];
    const definitions = await this.prisma.itemDefinition.findMany({
      where: {
        ...itemWhere,
        OR: [
          { marketHashName: { in: baseList } },
          { baseMarketHashName: { in: baseList } },
        ],
      },
    });
    const rows = definitions
      .filter((item) => isListableMarketHashName(item.marketHashName))
      .map((item) =>
        this.buildCatalogItemRow(
          item,
          aggregates.lotStats,
          popularStats,
          aggregates.featuredLots,
          {},
          {},
        ),
      )
      .sort((a, b) => {
        if (b.orderCount30d !== a.orderCount30d) {
          return b.orderCount30d - a.orderCount30d;
        }
        if (b.activeLotCount !== a.activeLotCount) {
          return b.activeLotCount - a.activeLotCount;
        }
        return a.marketHashName.localeCompare(b.marketHashName);
      })
      .slice(0, capped);

    const hydrated = await this.hydrateRowsWithCachedSteamPrices(rows);
    const withIcons = await this.hydrateMissingIconsFromSnapshots(hydrated.rows);
    this.scheduleMissingSteamPriceRefresh(withIcons);
    this.itemIcons.scheduleMissingIconRefresh(withIcons);

    return toJsonSafe(withIcons);
  }

  async getSteamPrices(
    marketHashNames: string[],
    options?: { cacheOnly?: boolean; forceRefresh?: boolean },
  ) {
    const prices = await this.steamMarketPrice.getPricesWithMeta(
      marketHashNames,
      {
        ...(options?.cacheOnly ? { cacheOnly: true } : {}),
        ...(options?.forceRefresh ? { forceRefresh: true } : {}),
      },
    );
    const latestSteamPriceFetch =
      Object.values(prices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    return toJsonSafe({ prices, steamPriceFetchedAt: latestSteamPriceFetch });
  }

  private buildListResponse(
    items: CatalogItemRow[],
    total: number,
    page: number,
    limit: number,
    steamPriceFetchedAt: string | null = null,
  ) {
    return toJsonSafe({
      items,
      total,
      page,
      limit,
      steamPriceFetchedAt,
      referencePriceFetchedAt: null,
    });
  }

  private async hydrateRowsWithCachedSteamPrices(
    rows: CatalogItemRow[],
  ): Promise<{ rows: CatalogItemRow[]; steamPriceFetchedAt: string | null }> {
    if (rows.length === 0) {
      return { rows, steamPriceFetchedAt: null };
    }

    const steamLookupByRowId = new Map(
      rows.map((row) => [
        row.id,
        resolveCatalogCardDisplaySteamPriceName(
          row.marketHashName,
          row.availableWears,
        ),
      ]),
    );
    const steamLookupNames = [
      ...new Set(steamLookupByRowId.values()),
    ];

    const steamPrices = await this.steamMarketPrice.getPricesWithMeta(
      steamLookupNames,
      { cacheOnly: true },
    );

    const hydratedRows = rows.map((row) => {
      const lookupName = steamLookupByRowId.get(row.id) ?? row.marketHashName;
      const steamEntry = steamPrices[lookupName];
      return {
        ...row,
        steamPriceMinor: steamEntry?.priceMinor ?? null,
        steamPriceFetchedAt: steamEntry?.fetchedAt ?? null,
      };
    });

    const latestSteamPriceFetch =
      Object.values(steamPrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return {
      rows: hydratedRows,
      steamPriceFetchedAt: latestSteamPriceFetch,
    };
  }

  private async hydrateMissingIconsFromSnapshots(
    rows: CatalogItemRow[],
  ): Promise<CatalogItemRow[]> {
    const missing = rows.filter((row) => !row.iconUrl?.trim());
    if (missing.length === 0) {
      return rows;
    }

    const updated = await this.itemIcons.backfillFromListingSnapshots(
      missing.map((row) => row.id),
    );
    if (updated === 0) {
      return rows;
    }

    const refreshed = await this.prisma.itemDefinition.findMany({
      where: { id: { in: missing.map((row) => row.id) } },
      select: { id: true, iconUrl: true },
    });
    const iconById = new Map(
      refreshed.map((item) => [item.id, item.iconUrl?.trim() || null]),
    );

    return rows.map((row) => {
      if (row.iconUrl?.trim()) {
        return row;
      }
      const iconUrl = iconById.get(row.id);
      return iconUrl ? { ...row, iconUrl } : row;
    });
  }

  private scheduleMissingSteamPriceRefresh(rows: CatalogItemRow[]): void {
    // Seeded catalog cards skip bulk Steam price refresh (optional until needed).
    const missing = rows
      .filter(
        (row) =>
          !row.catalogSeeded &&
          row.steamPriceMinor == null &&
          row.activeLotCount > 0,
      )
      .map((row) =>
        resolveCatalogCardDisplaySteamPriceName(
          row.marketHashName,
          row.availableWears,
        ),
      );
    if (missing.length === 0) {
      return;
    }
    void this.steamMarketPrice.getPricesWithMeta(missing);
  }

  private async getCatalogListIndex(
    query: ListCatalogItemsQueryDto,
  ): Promise<CatalogListIndex> {
    const indexKey = catalogIndexCacheKey(query);
    return this.catalogIndexCache.getOrSet(indexKey, async () => {
      const where = this.buildItemWhere(query);
      const [aggregates, popularStats, definitions] = await Promise.all([
        this.loadActiveLotAggregates(query, {}),
        this.loadPopularStats(),
        this.loadCatalogDefinitions(query, where),
      ]);

      const rows = definitions
        .map((item) =>
          this.buildCatalogItemRow(
            item,
            aggregates.lotStats,
            popularStats,
            aggregates.featuredLots,
            {},
            {},
          ),
        )
        .filter((row) => this.matchesCatalogVisibility(row, query));

      const sorted = this.sortItems(rows, query.sort ?? 'newest');
      return { rows: this.filterByPrice(sorted, query) };
    });
  }

  private async loadCatalogDefinitions(
    query: ListCatalogItemsQueryDto,
    where: Prisma.ItemDefinitionWhereInput,
  ): Promise<ItemDefinitionRecord[]> {
    return this.definitionsCache.getOrSet(
      catalogDefinitionsCacheKey(query),
      () =>
        this.prisma.itemDefinition.findMany({
          where,
          orderBy: { marketHashName: 'asc' },
        }),
    );
  }

  private buildCatalogItemRow(
    item: ItemDefinitionRecord,
    lotStats: Map<string, { minPriceMinor: bigint; count: number; latestListedAt: Date | null }>,
    popularStats: Map<string, number>,
    featuredLots: Map<string, string>,
    steamPrices: Record<string, { priceMinor: number | null; fetchedAt?: string | null }>,
    referencePrices: Record<
      string,
      {
        buffPriceMinor: number | null;
        csfloatPriceMinor: number | null;
        fetchedAt?: string | null;
      }
    >,
  ): CatalogItemRow {
    const baseName =
      item.baseMarketHashName ?? deriveBaseMarketHashName(item.marketHashName);
    const baseStats = lotStats.get(catalogBaseKey(baseName));
    const idStats = lotStats.get(item.id);
    const stats = baseStats ?? idStats;
    return {
      id: item.id,
      slug: item.slug ?? null,
      marketHashName: item.marketHashName,
      weapon: item.weapon,
      rarity: item.rarity,
      iconUrl: item.iconUrl,
      wearIcons: parseWearIcons(item.wearIcons),
      availableWears: parseAvailableWears(item.availableWears),
      catalogSeeded: Boolean(item.catalogSeeded),
      minMarketplacePriceMinor: stats?.minPriceMinor?.toString() ?? null,
      activeLotCount: stats?.count ?? 0,
      latestListedAt: stats?.latestListedAt?.toISOString() ?? null,
      orderCount30d:
        popularStats.get(catalogBaseKey(baseName)) ??
        popularStats.get(item.id) ??
        0,
      steamPriceMinor: steamPrices[item.marketHashName]?.priceMinor ?? null,
      steamPriceFetchedAt: steamPrices[item.marketHashName]?.fetchedAt ?? null,
      buffPriceMinor:
        referencePrices[item.marketHashName]?.buffPriceMinor ?? null,
      csfloatPriceMinor:
        referencePrices[item.marketHashName]?.csfloatPriceMinor ?? null,
      featuredLotId:
        featuredLots.get(catalogBaseKey(baseName)) ??
        featuredLots.get(item.id) ??
        null,
    };
  }

  private matchesCatalogVisibility(
    row: CatalogItemRow,
    query: ListCatalogItemsQueryDto,
  ): boolean {
    if (row.activeLotCount > 0) {
      return true;
    }
    if (query.floatMin !== undefined || query.floatMax !== undefined) {
      return false;
    }
    if (query.wear) {
      // Wear filter is applied to lots; empty cards stay hidden.
      return false;
    }
    return true;
  }

  private buildItemWhere(
    query: ListCatalogItemsQueryDto,
  ): Prisma.ItemDefinitionWhereInput {
    const where: Prisma.ItemDefinitionWhereInput = {
      game: 'CS2',
      // One card per skin from catalog import; wear variants live as sibling defs.
      catalogSeeded: true,
      NOT: this.buildNonListableMarketHashNameFilter(),
    };
    this.applyMarketHashNameQuery(where, query.q, query.marketHashName);
    applyCatalogSkinTraitFilters(where, {
      stattrak: query.stattrak,
      souvenir: query.souvenir,
    });
    this.applyWeaponFilter(where, query.weapon);
    if (query.rarity) {
      where.rarity = { equals: query.rarity, mode: 'insensitive' };
    }
    return where;
  }

  /**
   * Exact weapon match. Pipe-separated values = OR (e.g. gloves / knives "all").
   * Merges with an existing marketHashName OR via AND so both filters can apply.
   */
  private applyWeaponFilter(
    where: Prisma.ItemDefinitionWhereInput,
    weapon?: string,
  ): void {
    if (!weapon?.trim()) {
      return;
    }

    const terms = weapon
      .split('|')
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length === 0) {
      return;
    }

    if (terms.length === 1) {
      where.weapon = { equals: terms[0], mode: 'insensitive' };
      return;
    }

    const weaponOr: Prisma.ItemDefinitionWhereInput[] = terms.map((term) => ({
      weapon: { equals: term, mode: 'insensitive' as const },
    }));

    if (where.OR) {
      const marketOr = where.OR;
      delete where.OR;
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [...existingAnd, { OR: marketOr }, { OR: weaponOr }];
      return;
    }

    where.OR = weaponOr;
  }

  /** Prisma mirror of isListableMarketHashName — keep fragments/names in sync via shared constants. */
  private buildNonListableMarketHashNameFilter(): Prisma.ItemDefinitionWhereInput {
    return {
      OR: [
        ...NON_LISTABLE_MARKET_HASH_NAME_FRAGMENTS.map((fragment) => ({
          marketHashName: {
            contains: fragment,
            mode: 'insensitive' as const,
          },
        })),
        ...DEFAULT_STOCK_WEAPON_MARKET_HASH_NAMES.map((name) => ({
          marketHashName: {
            equals: name,
            mode: 'insensitive' as const,
          },
        })),
      ],
    };
  }

  private applyMarketHashNameQuery(
    where: Prisma.ItemDefinitionWhereInput,
    q?: string,
    marketHashName?: string,
  ): void {
    if (marketHashName?.trim()) {
      const exactTerms = marketHashName
        .split('|')
        .map((term) => term.trim())
        .filter(Boolean);
      if (exactTerms.length > 1) {
        where.OR = exactTerms.map((term) => ({
          marketHashName: { equals: term, mode: 'insensitive' as const },
        }));
        return;
      }
      if (exactTerms.length === 1) {
        where.marketHashName = {
          equals: exactTerms[0],
          mode: 'insensitive',
        };
      }
      return;
    }

    if (!q?.trim()) {
      return;
    }

    const terms = q
      .split('|')
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length > 1) {
      where.OR = terms.map((term) => ({
        marketHashName: { contains: term, mode: 'insensitive' },
      }));
      return;
    }

    where.marketHashName = { contains: terms[0], mode: 'insensitive' };
  }

  private async loadActiveLotAggregates(
    query: Pick<ListCatalogItemsQueryDto, 'wear' | 'floatMin' | 'floatMax'>,
    options: { baseNames?: string[] } = {},
  ): Promise<CatalogLotAggregates> {
    const cacheKey = catalogLotAggregatesCacheKey(query, options.baseNames);
    return this.lotAggregatesCache.getOrSet(cacheKey, async () => {
      const lots = await this.prisma.lot.findMany({
        where: {
          status: LotStatus.ACTIVE,
          inventoryAsset: {
            itemDefinition: this.buildLotItemDefinitionFilter(options.baseNames),
          },
        },
        orderBy: { priceMinor: 'asc' },
        select: {
          id: true,
          priceMinor: true,
          createdAt: true,
          inventoryAsset: {
            select: {
              itemDefinitionId: true,
              wear: true,
              floatValue: true,
              itemDefinition: {
                select: {
                  baseMarketHashName: true,
                  marketHashName: true,
                },
              },
            },
          },
          listingSnapshot: {
            select: {
              wear: true,
              floatValue: true,
              marketHashName: true,
            },
          },
        },
      });

      return buildCatalogLotAggregates(lots, query);
    });
  }

  private async loadPopularStats(
    options: { baseNames?: string[] } = {},
  ): Promise<Map<string, number>> {
    const cacheKey = JSON.stringify({
      baseNames: options.baseNames?.length ? [...options.baseNames].sort() : null,
    });
    return this.popularStatsCache.getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - POPULAR_WINDOW_MS);
      const orders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.COMPLETED,
          createdAt: { gte: since },
          ...(options.baseNames?.length
            ? {
                lot: {
                  inventoryAsset: {
                    itemDefinition: this.buildLotItemDefinitionFilter(
                      options.baseNames,
                    ),
                  },
                },
              }
            : {}),
        },
        select: {
          lot: {
            select: {
              inventoryAsset: {
                select: {
                  itemDefinitionId: true,
                  itemDefinition: {
                    select: {
                      baseMarketHashName: true,
                      marketHashName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const map = new Map<string, number>();
      for (const order of orders) {
        const asset = order.lot.inventoryAsset;
        map.set(
          asset.itemDefinitionId,
          (map.get(asset.itemDefinitionId) ?? 0) + 1,
        );
        const baseKey =
          asset.itemDefinition.baseMarketHashName ??
          deriveBaseMarketHashName(asset.itemDefinition.marketHashName);
        if (baseKey) {
          const key = catalogBaseKey(baseKey);
          map.set(key, (map.get(key) ?? 0) + 1);
        }
      }
      return map;
    });
  }

  /** Lots attach to wear-specific definitions — never filter by catalogSeeded here. */
  private buildLotItemDefinitionFilter(
    baseNames?: string[],
  ): Prisma.ItemDefinitionWhereInput {
    const where: Prisma.ItemDefinitionWhereInput = {
      game: 'CS2',
      NOT: this.buildNonListableMarketHashNameFilter(),
    };
    if (baseNames?.length) {
      where.OR = [
        { baseMarketHashName: { in: baseNames } },
        { marketHashName: { in: baseNames } },
      ];
    }
    return where;
  }

  private sortItems(
    rows: CatalogItemRow[],
    sort: ListCatalogItemsQueryDto['sort'],
  ): CatalogItemRow[] {
    const copy = [...rows];
    const effectiveSort = sort ?? 'newest';

    if (effectiveSort === 'cheapest' || effectiveSort === 'price_desc') {
      copy.sort((a, b) => {
        const aPrice = a.minMarketplacePriceMinor
          ? Number(a.minMarketplacePriceMinor)
          : Number.POSITIVE_INFINITY;
        const bPrice = b.minMarketplacePriceMinor
          ? Number(b.minMarketplacePriceMinor)
          : Number.POSITIVE_INFINITY;
        if (aPrice !== bPrice) {
          return effectiveSort === 'price_desc' ? bPrice - aPrice : aPrice - bPrice;
        }
        return a.marketHashName.localeCompare(b.marketHashName);
      });
      return copy;
    }

    if (effectiveSort === 'popular') {
      copy.sort((a, b) => {
        if (b.orderCount30d !== a.orderCount30d) {
          return b.orderCount30d - a.orderCount30d;
        }
        if (b.activeLotCount !== a.activeLotCount) {
          return b.activeLotCount - a.activeLotCount;
        }
        return a.marketHashName.localeCompare(b.marketHashName);
      });
      return copy;
    }

    copy.sort((a, b) => {
      const aListedAt = a.latestListedAt ? Date.parse(a.latestListedAt) : 0;
      const bListedAt = b.latestListedAt ? Date.parse(b.latestListedAt) : 0;
      if (bListedAt !== aListedAt) {
        return bListedAt - aListedAt;
      }
      if (b.activeLotCount !== a.activeLotCount) {
        return b.activeLotCount - a.activeLotCount;
      }
      return a.marketHashName.localeCompare(b.marketHashName);
    });
    return copy;
  }

  private filterByPrice(
    rows: CatalogItemRow[],
    query: ListCatalogItemsQueryDto,
  ): CatalogItemRow[] {
    return rows.filter((row) => {
      if (!row.minMarketplacePriceMinor) {
        return (
          query.minPriceMinor === undefined && query.maxPriceMinor === undefined
        );
      }
      const price = Number(row.minMarketplacePriceMinor);
      if (query.minPriceMinor !== undefined && price < query.minPriceMinor) {
        return false;
      }
      if (query.maxPriceMinor !== undefined && price > query.maxPriceMinor) {
        return false;
      }
      return true;
    });
  }

  private async findItemDefinition(ref: string) {
    if (isUuid(ref)) {
      return this.prisma.itemDefinition.findUnique({ where: { id: ref } });
    }

    const bySlug = await this.prisma.itemDefinition.findUnique({
      where: { slug: ref },
    });
    if (bySlug) {
      return bySlug;
    }

    return this.prisma.itemDefinition.findUnique({ where: { id: ref } });
  }
}
