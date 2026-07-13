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

@Injectable()
export class InventoryService {
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

    const syncResult = await this.inventoryProvider.syncInventory(
      ownerId,
      user.steamId,
      { force },
    );

    const assets = await this.prisma.inventoryAsset.findMany({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
      include: { itemDefinition: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      assets: toJsonSafe(assets),
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

  async getPriceHints(marketHashNames: string[], forceRefresh = false) {
    const uniqueNames = [...new Set(marketHashNames.filter(Boolean))];
    const sellPriceOptions = {
      forceRefresh,
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
