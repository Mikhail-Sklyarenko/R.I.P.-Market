import { Injectable } from '@nestjs/common';
import { LotStatus, OrderStatus, Prisma } from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { parseFloatValue } from '../lots/float-tier.util';
import { ReferencePriceService } from './reference-price.service';
import { SteamMarketPriceService } from './steam-market-price.service';
import type { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';
import {
  lotWearMatchesMarketHashName,
  resolveSteamMarketHashName,
} from '../lots/steam-market-link.util';

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
    const listedItemIds = await this.loadListedItemDefinitionIds(where, query);

    if (listedItemIds.length === 0) {
      return toJsonSafe({
        items: [],
        total: 0,
        page,
        limit,
        steamPriceFetchedAt: null,
        referencePriceFetchedAt: null,
      });
    }

    const itemWhere: Prisma.ItemDefinitionWhereInput = {
      ...where,
      id: { in: listedItemIds },
    };

    const [allItems, lotStats, popularStats, featuredLots] = await Promise.all([
      this.prisma.itemDefinition.findMany({
        where: itemWhere,
        orderBy: { marketHashName: 'asc' },
      }),
      this.loadActiveLotStats(itemWhere),
      this.loadPopularStats(),
      this.loadFeaturedLots(itemWhere, query),
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
      .map((item) => {
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
      })
      .filter((row) => row.activeLotCount > 0);

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
  ): Promise<Map<string, { minPriceMinor: bigint; count: number }>> {
    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: { itemDefinition: itemWhere },
      },
      select: {
        priceMinor: true,
        inventoryAsset: { select: { itemDefinitionId: true } },
      },
    });

    const map = new Map<string, { minPriceMinor: bigint; count: number }>();
    for (const lot of lots) {
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
            itemDefinition: { select: { marketHashName: true } },
          },
        },
        listingSnapshot: {
          select: {
            wear: true,
            marketHashName: true,
          },
        },
      },
    });

    const map = new Map<string, string>();
    for (const lot of lots) {
      const itemDefinitionId = lot.inventoryAsset.itemDefinitionId;
      if (map.has(itemDefinitionId)) {
        continue;
      }

      const wear = lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear;
      if (query.wear && wear?.toUpperCase() !== query.wear.toUpperCase()) {
        continue;
      }

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

  private async loadListedItemDefinitionIds(
    itemWhere: Prisma.ItemDefinitionWhereInput,
    query: ListCatalogItemsQueryDto,
  ): Promise<string[]> {
    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: { itemDefinition: itemWhere },
      },
      select: {
        inventoryAsset: {
          select: {
            itemDefinitionId: true,
            floatValue: true,
            wear: true,
          },
        },
        listingSnapshot: {
          select: {
            floatValue: true,
            wear: true,
          },
        },
      },
    });

    const filtered = lots.filter((lot) => {
      const wear = lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear;
      if (query.wear && wear?.toUpperCase() !== query.wear.toUpperCase()) {
        return false;
      }

      const floatValue =
        lot.listingSnapshot?.floatValue ?? lot.inventoryAsset.floatValue;
      const numeric = parseFloatValue(floatValue);
      if (numeric === null) {
        return query.floatMin === undefined && query.floatMax === undefined;
      }
      if (query.floatMin !== undefined && numeric < query.floatMin) {
        return false;
      }
      if (query.floatMax !== undefined && numeric > query.floatMax) {
        return false;
      }
      return true;
    });

    return [
      ...new Set(filtered.map((lot) => lot.inventoryAsset.itemDefinitionId)),
    ];
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
        return b.activeLotCount - a.activeLotCount;
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
