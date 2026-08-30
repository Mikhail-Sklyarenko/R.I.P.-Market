import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InventoryAssetStatus, LotStatus, BuyRequestStatus } from '@prisma/client';
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
import { SteamInventoryProvider } from '../providers/inventory/steam-inventory.provider';
import type { ParsedSteamAsset } from '../providers/inventory/steam-inventory.parser';
import { getProvidersConfig } from '../providers/config';
import { resolveSuggestedListPrice } from './suggested-list-price.util';
import { isRealSteamId } from '../common/steam-id.util';

export type InventoryPriceHint = {
  steamPriceMinor: number | null;
  /** Steam market median when known from a live priceoverview fetch. */
  steamMedianPriceMinor: number | null;
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  minMarketplacePriceMinor: string | null;
  /** Best open buy-request (bid) for this market hash name, if any. */
  bestBidMinor: string | null;
  /** Remaining quantity at the best bid price. */
  bestBidQuantity: number | null;
  /** I2: suggested list price (bid ?? Steam −5%). */
  suggestedListMinor: number | null;
  suggestedListSource: 'bid' | 'steam_discount' | null;
  commissionMinor: number | null;
  sellerReceiveMinor: number | null;
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
    backgroundPending?: boolean;
  };
};

type PriceHintFetchOptions = {
  forceRefresh?: boolean;
  cacheOnly?: boolean;
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly backgroundSyncInflight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_PROVIDER)
    private readonly inventoryProvider: InventoryProvider,
    private readonly steamMarketPrice: SteamMarketPriceService,
    private readonly steamInventoryProvider: SteamInventoryProvider,
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
    // Any authenticated owner may force-refresh their own inventory.
    // Gating by SELLER blocked first-sale onboarding (FORBIDDEN on «Обновить из Steam»).

    if (!force) {
      const soft = await this.tryServeCachedInventory(ownerId);
      if (soft) {
        return this.attachBackgroundSync(
          ownerId,
          user.steamId,
          soft.result,
          soft.refreshInBackground,
          false,
        );
      }
    } else {
      // Force refresh: never block the seller UI on Steam when we already have
      // items to show. Return cache immediately and sync in the background.
      const soft = await this.tryServeCachedInventory(ownerId);
      const cachedAssets = soft?.result.assets;
      if (
        soft &&
        Array.isArray(cachedAssets) &&
        cachedAssets.length > 0
      ) {
        return this.attachBackgroundSync(
          ownerId,
          user.steamId,
          {
            ...soft.result,
            sync: {
              ...soft.result.sync,
              stale: true,
              cacheHit: true,
              warning: 'Обновляем инвентарь из Steam в фоне…',
            },
          },
          true,
          true,
        );
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
        : latest.status === 'FAILED'
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
          backgroundPending: false,
        },
      },
      refreshInBackground: !cacheFresh,
    };
  }

  private attachBackgroundSync(
    ownerId: string,
    steamId: string | null | undefined,
    result: InventoryListResult,
    refreshInBackground: boolean,
    force: boolean,
  ): InventoryListResult {
    if (refreshInBackground) {
      this.scheduleBackgroundSync(ownerId, steamId, force);
    }
    const backgroundPending = this.backgroundSyncInflight.has(ownerId);
    return {
      ...result,
      sync: {
        ...result.sync,
        backgroundPending,
        warning: result.sync.stale
          ? backgroundPending
            ? result.sync.warning ??
              'Показываем последнюю копию — обновляем из Steam в фоне'
            : result.sync.warning
          : null,
      },
    };
  }

  private scheduleBackgroundSync(
    ownerId: string,
    steamId?: string | null,
    force = false,
  ): void {
    if (this.backgroundSyncInflight.has(ownerId)) {
      return;
    }
    const task = this.inventoryProvider
      .syncInventory(ownerId, steamId, { force })
      .then(() => undefined)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Background inventory sync failed for ${ownerId}: ${message}`,
        );
      })
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
        backgroundPending: false,
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

  /**
   * Slice 4: extension pushes a Steam-tab inventory snapshot when server sync is blocked.
   */
  async applyExtensionBrowserAssist(
    userId: string,
    input: {
      steamId: string;
      assets: Array<{
        assetId: string;
        marketHashName: string;
        classId?: string;
        instanceId?: string;
        tradable?: boolean;
        marketable?: boolean;
        tradeLockUntil?: string | null;
        floatValue?: string | null;
        paintSeed?: number | null;
        wear?: string | null;
        iconUrl?: string | null;
      }>;
      complete?: boolean;
    },
  ): Promise<SyncResult> {
    if (getProvidersConfig().inventory !== 'steam') {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Browser assist sync requires Steam inventory provider',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.steamId || !isRealSteamId(user.steamId)) {
      throw new AppException(
        ErrorCode.STEAM_NOT_LINKED,
        'Link your Steam account before syncing inventory',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (user.steamId !== input.steamId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'SteamID does not match the paired account',
        HttpStatus.FORBIDDEN,
      );
    }

    const parsed: ParsedSteamAsset[] = [];
    for (const asset of input.assets) {
      const marketHashName = asset.marketHashName?.trim();
      const assetId = asset.assetId?.trim();
      if (!marketHashName || !assetId) {
        continue;
      }
      let tradeLockUntil: Date | null = null;
      if (asset.tradeLockUntil) {
        const parsedDate = new Date(asset.tradeLockUntil);
        if (!Number.isNaN(parsedDate.getTime())) {
          tradeLockUntil = parsedDate;
        }
      }
      parsed.push({
        assetExternalId: assetId,
        marketHashName,
        iconUrl: asset.iconUrl?.trim() || null,
        tradable: asset.tradable !== false,
        marketable: asset.marketable !== false,
        tradeLockUntil,
        floatValue: asset.floatValue ?? null,
        paintSeed:
          asset.paintSeed != null && Number.isFinite(asset.paintSeed)
            ? Math.floor(asset.paintSeed)
            : null,
        wear: asset.wear ?? null,
        stickers: [],
        inspectLinkTemplate: null,
        inspectLinkPayload: null,
        classExternalId: asset.classId?.trim() || '0',
        instanceExternalId: asset.instanceId?.trim() || '0',
      });
    }

    if (parsed.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'No valid assets in browser assist payload',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.steamInventoryProvider.applyBrowserAssistAssets(
      userId,
      input.steamId,
      parsed,
      { complete: input.complete === true },
    );
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
    const bestBids = await this.loadBestBids(uniqueNames);

    const hints: Record<string, InventoryPriceHint> = {};
    for (const name of uniqueNames) {
      const bid = bestBids.get(name);
      const base = {
        steamPriceMinor: steamPrices[name]?.priceMinor ?? null,
        steamMedianPriceMinor: steamPrices[name]?.medianPriceMinor ?? null,
        buffPriceMinor: null,
        csfloatPriceMinor: null,
        minMarketplacePriceMinor: marketplacePrices.get(name) ?? null,
        bestBidMinor: bid?.priceMinor ?? null,
        bestBidQuantity: bid?.quantity ?? null,
      };
      const suggested = resolveSuggestedListPrice(base);
      hints[name] = {
        ...base,
        suggestedListMinor: suggested.suggestedListMinor,
        suggestedListSource: suggested.suggestedListSource,
        commissionMinor: suggested.commissionMinor,
        sellerReceiveMinor: suggested.sellerReceiveMinor,
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

  /**
   * I2: batch suggested list prices for the Steam inventory overlay.
   * Accepts marketHashName and/or steamAssetId (platform assetExternalId).
   */
  async getExtensionSuggestedPrices(
    userId: string,
    items: Array<{ marketHashName?: string; steamAssetId?: string }>,
    options: PriceHintFetchOptions = {},
  ) {
    const normalized = items.map((item) => ({
      marketHashName: item.marketHashName?.trim() || null,
      steamAssetId: item.steamAssetId?.trim() || null,
    }));

    const steamAssetIds = [
      ...new Set(
        normalized
          .map((item) => item.steamAssetId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const assets =
      steamAssetIds.length > 0
        ? await this.prisma.inventoryAsset.findMany({
            where: {
              ownerId: userId,
              assetExternalId: { in: steamAssetIds },
            },
            select: {
              id: true,
              assetExternalId: true,
              itemDefinition: { select: { marketHashName: true } },
              lot: {
                select: { status: true, priceMinor: true },
              },
            },
          })
        : [];

    const assetBySteamId = new Map(
      assets.map((asset) => [asset.assetExternalId, asset]),
    );

    const names = [
      ...new Set(
        normalized
          .map((item) => {
            if (item.marketHashName) {
              return item.marketHashName;
            }
            if (!item.steamAssetId) {
              return null;
            }
            return (
              assetBySteamId.get(item.steamAssetId)?.itemDefinition
                .marketHashName ?? null
            );
          })
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    const hintsPayload =
      names.length > 0
        ? await this.getPriceHints(names, options)
        : {
            hints: {} as Record<string, InventoryPriceHint>,
            steamPriceFetchedAt: null as string | null,
            steamPriceMissing: [] as string[],
          };

    const results = normalized.map((item) => {
      const asset = item.steamAssetId
        ? assetBySteamId.get(item.steamAssetId)
        : undefined;
      const marketHashName =
        item.marketHashName ??
        asset?.itemDefinition.marketHashName ??
        null;
      const hint = marketHashName
        ? (hintsPayload.hints[marketHashName] as InventoryPriceHint | undefined)
        : undefined;
      const listedPriceMinor =
        asset?.lot?.status === LotStatus.ACTIVE
          ? asset.lot.priceMinor.toString()
          : null;

      return {
        marketHashName,
        steamAssetId: item.steamAssetId,
        inventoryAssetId: asset?.id ?? null,
        listedPriceMinor,
        steamGuideMinor: hint?.steamPriceMinor ?? null,
        ripMinAskMinor: hint?.minMarketplacePriceMinor ?? null,
        bestBidMinor: hint?.bestBidMinor ?? null,
        bestBidQuantity: hint?.bestBidQuantity ?? null,
        suggestedListMinor: hint?.suggestedListMinor ?? null,
        suggestedListSource: hint?.suggestedListSource ?? null,
        commissionMinor: hint?.commissionMinor ?? null,
        sellerReceiveMinor: hint?.sellerReceiveMinor ?? null,
      };
    });

    return toJsonSafe({
      results,
      steamPriceFetchedAt: hintsPayload.steamPriceFetchedAt ?? null,
      steamPriceMissing: hintsPayload.steamPriceMissing ?? [],
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

  /**
   * Best open buy-request bid per market hash name.
   * Notify-match only today — not an auto-fill / instant settlement.
   */
  private async loadBestBids(
    marketHashNames: string[],
  ): Promise<Map<string, { priceMinor: string; quantity: number }>> {
    if (marketHashNames.length === 0) {
      return new Map();
    }

    const requests = await this.prisma.buyRequest.findMany({
      where: {
        status: BuyRequestStatus.OPEN,
        maxPriceMinor: { not: null },
        itemDefinition: {
          marketHashName: { in: marketHashNames },
        },
      },
      select: {
        maxPriceMinor: true,
        quantity: true,
        quantityFilled: true,
        itemDefinition: { select: { marketHashName: true } },
      },
    });

    const bestByName = new Map<string, { priceMinor: bigint; quantity: number }>();

    for (const request of requests) {
      if (request.maxPriceMinor == null || request.maxPriceMinor <= 0n) {
        continue;
      }
      const remaining = request.quantity - request.quantityFilled;
      if (remaining <= 0) {
        continue;
      }
      const name = request.itemDefinition.marketHashName;
      const current = bestByName.get(name);
      if (!current || request.maxPriceMinor > current.priceMinor) {
        bestByName.set(name, {
          priceMinor: request.maxPriceMinor,
          quantity: remaining,
        });
        continue;
      }
      if (request.maxPriceMinor === current.priceMinor) {
        current.quantity += remaining;
      }
    }

    return new Map(
      [...bestByName.entries()].map(([name, entry]) => [
        name,
        {
          priceMinor: entry.priceMinor.toString(),
          quantity: entry.quantity,
        },
      ]),
    );
  }
}
