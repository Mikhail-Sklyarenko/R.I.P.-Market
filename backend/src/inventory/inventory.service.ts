import {
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryAssetStatus, LotStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { SteamMarketPriceService } from '../catalog/steam-market-price.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type {
  InventoryProvider,
  SyncResult,
} from '../providers/inventory/inventory-provider.interface';
import { getProvidersConfig } from '../providers/config';

export type InventoryPriceHint = {
  steamPriceMinor: number | null;
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  minMarketplacePriceMinor: string | null;
};

export type InventoryListResult = {
  assets: ReturnType<typeof toJsonSafe>;
  sync: {
    lastSyncedAt: string;
    expiresAt: string;
    stale: boolean;
    cacheHit: boolean;
    status: SyncResult['status'];
    itemCount: number;
    warning?: string | null;
    errorCode?: string | null;
  };
};

type PriceHintFetchOptions = {
  forceRefresh?: boolean;
  cacheOnly?: boolean;
};

@Injectable()
export class InventoryService {
  private readonly backgroundSyncInflight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_PROVIDER)
    private readonly inventoryProvider: InventoryProvider,
    private readonly steamMarketPrice: SteamMarketPriceService,
  ) {}

  async getUserInventory(
    ownerId: string,
    options?: { forceRefresh?: boolean; role?: string },
  ): Promise<InventoryListResult> {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const force = options?.forceRefresh === true;
    if (force && options?.role && !['SELLER', 'ADMIN'].includes(options.role)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only sellers and admins can force inventory refresh',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!force) {
      const soft = await this.tryServeCachedInventory(ownerId);
      if (soft) {
        if (soft.refreshInBackground) {
          this.scheduleBackgroundSync(ownerId, user.steamId);
        }
        return soft.result;
      }
    }

    const syncResult = await this.inventoryProvider.syncInventory(
      ownerId,
      user.steamId,
      { force },
    );

    return this.buildInventoryResult(ownerId, syncResult);
  }

  /**
   * Serve DB assets immediately when we already have a prior sync.
   * Fresh cache → no Steam wait. Expired cache → stale payload + background refresh.
   */
  private async tryServeCachedInventory(
    ownerId: string,
  ): Promise<{ result: InventoryListResult; refreshInBackground: boolean } | null> {
    const latest = await this.prisma.inventorySyncRun.findFirst({
      where: { userId: ownerId },
      orderBy: { fetchedAt: 'desc' },
    });
    if (!latest) {
      return null;
    }

    const assets = await this.prisma.inventoryAsset.findMany({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
      include: { itemDefinition: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Cold account with failed sync and no rows must hit Steam.
    if (assets.length === 0 && latest.status !== 'SUCCESS') {
      return null;
    }

    const now = Date.now();
    const cacheFresh =
      latest.status === 'SUCCESS' && latest.expiresAt.getTime() > now;

    const syncResult: SyncResult = {
      status:
        latest.status === 'SUCCESS' || latest.status === 'PARTIAL'
          ? 'CACHE_HIT'
          : 'FAILED',
      itemCount: latest.itemCount,
      fetchedAt: latest.fetchedAt,
      expiresAt: latest.expiresAt,
      cacheHit: true,
      stale: !cacheFresh,
      warning: cacheFresh
        ? null
        : 'Показываем последнюю копию — обновляем из Steam в фоне',
      errorCode: latest.errorCode,
    };

    return {
      result: {
        assets: toJsonSafe(await this.attachActiveLotFields(assets)),
        sync: {
          lastSyncedAt: syncResult.fetchedAt.toISOString(),
          expiresAt: syncResult.expiresAt.toISOString(),
          stale: syncResult.stale,
          cacheHit: true,
          status: syncResult.status,
          itemCount: syncResult.itemCount,
          warning: syncResult.warning ?? null,
          errorCode: syncResult.errorCode ?? null,
        },
      },
      refreshInBackground: !cacheFresh,
    };
  }

  private scheduleBackgroundSync(
    ownerId: string,
    steamId?: string | null,
  ): void {
    if (this.backgroundSyncInflight.has(ownerId)) {
      return;
    }
    const task = this.inventoryProvider
      .syncInventory(ownerId, steamId, { force: false })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.backgroundSyncInflight.delete(ownerId);
      });
    this.backgroundSyncInflight.set(ownerId, task);
  }

  private async buildInventoryResult(
    ownerId: string,
    syncResult: SyncResult,
  ): Promise<InventoryListResult> {
    const assets = await this.prisma.inventoryAsset.findMany({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
      include: { itemDefinition: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      assets: toJsonSafe(await this.attachActiveLotFields(assets)),
      sync: {
        lastSyncedAt: syncResult.fetchedAt.toISOString(),
        expiresAt: syncResult.expiresAt.toISOString(),
        stale: syncResult.stale,
        cacheHit: syncResult.cacheHit,
        status: syncResult.status,
        itemCount: syncResult.itemCount,
        warning: syncResult.warning ?? null,
        errorCode: syncResult.errorCode ?? null,
      },
    };
  }

  /**
   * Attach the seller's ACTIVE lot id/price so inventory UI can edit listings.
   */
  private async attachActiveLotFields<
    T extends { id: string; status: InventoryAssetStatus },
  >(
    assets: T[],
  ): Promise<
    Array<T & { activeLotId: string | null; listedPriceMinor: string | null }>
  > {
    const listedIds = assets
      .filter((asset) => asset.status === InventoryAssetStatus.LISTED)
      .map((asset) => asset.id);
    if (listedIds.length === 0) {
      return assets.map((asset) => ({
        ...asset,
        activeLotId: null,
        listedPriceMinor: null,
      }));
    }

    const lots = await this.prisma.lot.findMany({
      where: {
        inventoryAssetId: { in: listedIds },
        status: LotStatus.ACTIVE,
      },
      select: {
        id: true,
        inventoryAssetId: true,
        priceMinor: true,
      },
    });
    const lotByAssetId = new Map(
      lots.map((lot) => [
        lot.inventoryAssetId,
        { id: lot.id, priceMinor: lot.priceMinor.toString() },
      ]),
    );

    return assets.map((asset) => {
      const active = lotByAssetId.get(asset.id);
      return {
        ...asset,
        activeLotId: active?.id ?? null,
        listedPriceMinor: active?.priceMinor ?? null,
      };
    });
  }

  async syncForListing(ownerId: string, steamId?: string | null) {
    const latest = await this.prisma.inventorySyncRun.findFirst({
      where: { userId: ownerId },
      orderBy: { fetchedAt: 'desc' },
    });

    const force =
      (process.env.ENABLE_MOCK_TRADE === 'true' &&
        getProvidersConfig().inventory === 'mock') ||
      !latest ||
      latest.expiresAt <= new Date() ||
      latest.status !== 'SUCCESS';

    const syncResult = await this.inventoryProvider.syncInventory(
      ownerId,
      steamId,
      { force },
    );

    if (
      syncResult.stale &&
      syncResult.itemCount === 0 &&
      syncResult.status === 'FAILED'
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_STALE,
        'Inventory sync failed and no cached data is available',
        HttpStatus.SERVICE_UNAVAILABLE,
        { errorCode: syncResult.errorCode ?? undefined },
      );
    }

    return syncResult;
  }

  async checkAsset(ownerId: string, assetId: string) {
    const asset = await this.prisma.inventoryAsset.findFirst({
      where: { id: assetId, ownerId },
      include: { itemDefinition: true },
    });

    if (!asset) {
      throw new NotFoundException('Inventory asset not found');
    }

    return toJsonSafe(asset);
  }

  async getPriceHints(
    marketHashNames: string[],
    options: PriceHintFetchOptions = {},
  ) {
    const forceRefresh = options.forceRefresh === true;
    const cacheOnly = options.cacheOnly === true && !forceRefresh;
    const uniqueNames = [...new Set(marketHashNames.filter(Boolean))];
    const sellPriceOptions = {
      forceRefresh,
      cacheOnly,
      cacheTtlMs: 3 * 60 * 1000,
      failureCacheTtlMs: 30 * 1000,
    } as const;

    let steamPrices = await this.steamMarketPrice.getPricesWithMeta(
      uniqueNames,
      sellPriceOptions,
    );

    const missingAfterFirstPass = uniqueNames.filter(
      (name) => !steamPrices[name]?.priceMinor,
    );
    if (missingAfterFirstPass.length > 0 && forceRefresh) {
      const retried = await this.steamMarketPrice.getPricesWithMeta(
        missingAfterFirstPass,
        { ...sellPriceOptions, forceRefresh: true, cacheTtlMs: 0 },
      );
      steamPrices = { ...steamPrices, ...retried };
    }

    const stillMissing = uniqueNames.filter(
      (name) => !steamPrices[name]?.priceMinor,
    );

    const marketplacePrices = await this.loadMinMarketplacePrices(uniqueNames);

    const hints: Record<string, InventoryPriceHint> = {};
    for (const name of uniqueNames) {
      hints[name] = {
        steamPriceMinor: steamPrices[name]?.priceMinor ?? null,
        buffPriceMinor: null,
        csfloatPriceMinor: null,
        minMarketplacePriceMinor: marketplacePrices.get(name) ?? null,
      };
    }

    const steamPriceFetchedAt =
      Object.values(steamPrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return toJsonSafe({
      hints,
      steamPriceFetchedAt,
      referencePriceFetchedAt: null,
      steamPriceMissing:
        stillMissing.length > 0 && this.steamMarketPrice.isEnabled()
          ? stillMissing
          : [],
    });
  }

  private async loadMinMarketplacePrices(
    marketHashNames: string[],
  ): Promise<Map<string, string>> {
    if (marketHashNames.length === 0) {
      return new Map();
    }

    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: {
          itemDefinition: {
            marketHashName: { in: marketHashNames },
          },
        },
      },
      select: {
        priceMinor: true,
        inventoryAsset: {
          select: {
            itemDefinition: { select: { marketHashName: true } },
          },
        },
      },
    });

    const map = new Map<string, bigint>();
    for (const lot of lots) {
      const name = lot.inventoryAsset.itemDefinition.marketHashName;
      const current = map.get(name);
      if (!current || lot.priceMinor < current) {
        map.set(name, lot.priceMinor);
      }
    }

    return new Map(
      [...map.entries()].map(([name, priceMinor]) => [
        name,
        priceMinor.toString(),
      ]),
    );
  }
}
