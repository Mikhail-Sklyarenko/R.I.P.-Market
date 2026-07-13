import { HttpStatus, Injectable } from '@nestjs/common';
import { LotStatus, OrderStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  lotWearMatchesMarketHashName,
  parseWearCodeFromMarketHashName,
  resolveSteamMarketHashName,
} from '../lots/steam-market-link.util';
import { ReferencePriceService } from './reference-price.service';
import { SteamMarketPriceService } from './steam-market-price.service';
import type { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';
import { catalogLotMatchesWearFloatFilters } from './catalog-lot-filters.util';

const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type CatalogItemRow = {
  id: string;
  marketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  minMarketplacePriceMinor: string | null;
  activeLotCount: number;
  orderCount30d: number;
  steamPriceMinor: number | null;
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  featuredLotId: string | null;
};

type ItemDefinitionRecord = {
  id: string;
  marketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly steamMarketPrice: SteamMarketPriceService,
    private readonly referencePrice: ReferencePriceService,
  ) {}

  async listItems(query: ListCatalogItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const skip = (page - 1) * limit;
    const where = this.buildItemWhere(query);

    const [allItems, lotStats, popularStats, featuredLots] = await Promise.all([
      this.prisma.itemDefinition.findMany({
        where,
        orderBy: { marketHashName: 'asc' },
      }),
      this.loadActiveLotStats(where, query),
      this.loadPopularStats(),
      this.loadFeaturedLots(where, query),
    ]);

    const [steamPrices, referencePrices] = await Promise.all([
      this.steamMarketPrice.getPricesWithMeta(
        allItems.map((item) => item.marketHashName),
      ),
      this.referencePrice.getPricesWithMeta(
        allItems.map((item) => item.marketHashName),
      ),
    ]);
    const latestSteamPriceFetch =
      Object.values(steamPrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    const latestReferencePriceFetch =
      Object.values(referencePrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    const rows: CatalogItemRow[] = allItems
      .map((item) =>
        this.buildCatalogItemRow(
          item,
          lotStats,
          popularStats,
          featuredLots,
          steamPrices,
          referencePrices,
        ),
      )
      .filter((row) => this.matchesCatalogVisibility(row, query));

    const sorted = this.sortItems(rows, query.sort);
    const filtered = this.filterByPrice(sorted, query);
    const total = filtered.length;
    const items = filtered.slice(skip, skip + limit);

    return toJsonSafe({
      items,
      total,
      page,
      limit,
      steamPriceFetchedAt: latestSteamPriceFetch,
      referencePriceFetchedAt: latestReferencePriceFetch,
    });
  }

  async getItem(itemId: string) {
    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const where: Prisma.ItemDefinitionWhereInput = { id: itemId };
    const [lotStats, popularStats, featuredLots] = await Promise.all([
      this.loadActiveLotStats(where, {}),
      this.loadPopularStats(),
      this.loadFeaturedLots(where, {}),
    ]);
    const [steamPrices, referencePrices] = await Promise.all([
      this.steamMarketPrice.getPricesWithMeta([item.marketHashName]),
      this.referencePrice.getPricesWithMeta([item.marketHashName]),
    ]);

    return toJsonSafe(
      this.buildCatalogItemRow(
        item,
        lotStats,
        popularStats,
        featuredLots,
        steamPrices,
        referencePrices,
      ),
    );
  }

  async getReferencePrices(marketHashNames: string[]) {
    const prices = await this.referencePrice.getPricesWithMeta(marketHashNames);
    return toJsonSafe({ prices });
  }

  async listPopular(limit = 12) {
    const response = await this.listItems({
      sort: 'popular',
      page: 1,
      limit,
    });
    return response.items;
  }

  async getSteamPrices(marketHashNames: string[]) {
    const prices = await this.steamMarketPrice.getPricesMinor(marketHashNames);
    return toJsonSafe({ prices });
  }

  private buildCatalogItemRow(
    item: ItemDefinitionRecord,
    lotStats: Map<string, { minPriceMinor: bigint; count: number }>,
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
    const stats = lotStats.get(item.id);
    return {
      id: item.id,
      marketHashName: item.marketHashName,
      weapon: item.weapon,
      rarity: item.rarity,
      iconUrl: item.iconUrl,
      minMarketplacePriceMinor: stats?.minPriceMinor?.toString() ?? null,
      activeLotCount: stats?.count ?? 0,
      orderCount30d: popularStats.get(item.id) ?? 0,
      steamPriceMinor: steamPrices[item.marketHashName]?.priceMinor ?? null,
      buffPriceMinor:
        referencePrices[item.marketHashName]?.buffPriceMinor ?? null,
      csfloatPriceMinor:
        referencePrices[item.marketHashName]?.csfloatPriceMinor ?? null,
      featuredLotId: featuredLots.get(item.id) ?? null,
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
      const wearCode = parseWearCodeFromMarketHashName(row.marketHashName);
      if (!wearCode) {
        return false;
      }
      return wearCode.toUpperCase() === query.wear.toUpperCase();
    }
    return true;
  }

  private buildItemWhere(
    query: ListCatalogItemsQueryDto,
  ): Prisma.ItemDefinitionWhereInput {
    const where: Prisma.ItemDefinitionWhereInput = { game: 'CS2' };
    this.applyMarketHashNameQuery(where, query.q);
    if (query.weapon) {
      where.weapon = { equals: query.weapon, mode: 'insensitive' };
    }
    if (query.rarity) {
      where.rarity = { equals: query.rarity, mode: 'insensitive' };
    }
    return where;
  }

  private applyMarketHashNameQuery(
    where: Prisma.ItemDefinitionWhereInput,
    q?: string,
  ): void {
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

  private async loadActiveLotStats(
    itemWhere: Prisma.ItemDefinitionWhereInput,
    query: ListCatalogItemsQueryDto,
  ): Promise<Map<string, { minPriceMinor: bigint; count: number }>> {
    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: { itemDefinition: itemWhere },
      },
      select: {
        priceMinor: true,
        inventoryAsset: {
          select: {
            itemDefinitionId: true,
            wear: true,
            floatValue: true,
          },
        },
        listingSnapshot: {
          select: {
            wear: true,
            floatValue: true,
          },
        },
      },
    });

    const map = new Map<string, { minPriceMinor: bigint; count: number }>();
    for (const lot of lots) {
      if (!catalogLotMatchesWearFloatFilters(lot, query)) {
        continue;
      }
      const itemDefinitionId = lot.inventoryAsset.itemDefinitionId;
      const current = map.get(itemDefinitionId);
      if (!current) {
        map.set(itemDefinitionId, {
          minPriceMinor: lot.priceMinor,
          count: 1,
        });
        continue;
      }
      current.count += 1;
      if (lot.priceMinor < current.minPriceMinor) {
        current.minPriceMinor = lot.priceMinor;
      }
    }
    return map;
  }

  private async loadPopularStats(): Promise<Map<string, number>> {
    const since = new Date(Date.now() - POPULAR_WINDOW_MS);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        createdAt: { gte: since },
      },
      select: {
        lot: {
          select: {
            inventoryAsset: { select: { itemDefinitionId: true } },
          },
        },
      },
    });

    const map = new Map<string, number>();
    for (const order of orders) {
      const itemDefinitionId = order.lot.inventoryAsset.itemDefinitionId;
      map.set(itemDefinitionId, (map.get(itemDefinitionId) ?? 0) + 1);
    }
    return map;
  }

  private async loadFeaturedLots(
    itemWhere: Prisma.ItemDefinitionWhereInput,
    query: ListCatalogItemsQueryDto,
  ): Promise<Map<string, string>> {
    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: { itemDefinition: itemWhere },
      },
      orderBy: { priceMinor: 'asc' },
      select: {
        id: true,
        inventoryAsset: {
          select: {
            itemDefinitionId: true,
            wear: true,
            floatValue: true,
            itemDefinition: { select: { marketHashName: true } },
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

    const map = new Map<string, string>();
    for (const lot of lots) {
      if (!catalogLotMatchesWearFloatFilters(lot, query)) {
        continue;
      }

      const itemDefinitionId = lot.inventoryAsset.itemDefinitionId;
      if (map.has(itemDefinitionId)) {
        continue;
      }

      const wear = lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear;
      const marketHashName =
        lot.listingSnapshot?.marketHashName ??
        lot.inventoryAsset.itemDefinition.marketHashName;
      const itemDefinitionName = lot.inventoryAsset.itemDefinition.marketHashName;

      if (
        !lotWearMatchesMarketHashName(itemDefinitionName, wear) ||
        resolveSteamMarketHashName(marketHashName, wear) !==
          resolveSteamMarketHashName(itemDefinitionName, wear)
      ) {
        continue;
      }

      map.set(itemDefinitionId, lot.id);
    }
    return map;
  }

  private sortItems(
    rows: CatalogItemRow[],
    sort?: ListCatalogItemsQueryDto['sort'],
  ): CatalogItemRow[] {
    const copy = [...rows];
    if (sort === 'cheapest' || sort === 'price_desc') {
      copy.sort((a, b) => {
        const aPrice = a.minMarketplacePriceMinor
          ? Number(a.minMarketplacePriceMinor)
          : Number.POSITIVE_INFINITY;
        const bPrice = b.minMarketplacePriceMinor
          ? Number(b.minMarketplacePriceMinor)
          : Number.POSITIVE_INFINITY;
        return sort === 'price_desc' ? bPrice - aPrice : aPrice - bPrice;
      });
      return copy;
    }
    if (sort === 'popular') {
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
}
