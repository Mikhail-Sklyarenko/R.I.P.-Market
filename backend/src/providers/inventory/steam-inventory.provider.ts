import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InventoryAssetStatus, InventorySyncStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isRealSteamId } from '../../common/steam-id.util';
import { isListableMarketHashName } from '../../lots/listing-eligibility.util';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryMetricsService } from './inventory-metrics.service';
import { InventorySyncCacheService, getInventoryStaleGraceMs } from './inventory-sync-cache.service';
import {
  InventoryProvider,
  SyncInventoryOptions,
  SyncResult,
} from './inventory-provider.interface';
import { fetchAllSteamInventoryPages } from './steam-inventory.client';
import { cleanupOrphanItemDefinitions } from '../../item-definitions/cleanup-orphan-item-definitions.util';
import {
  parseSteamInventoryResponse,
  ParsedSteamAsset,
} from './steam-inventory.parser';

function maskSteamId(steamId: string): string {
  if (steamId.length <= 4) {
    return '****';
  }
  return `${steamId.slice(0, 4)}****${steamId.slice(-2)}`;
}

@Injectable()
export class SteamInventoryProvider implements InventoryProvider {
  readonly type = 'steam' as const;
  private readonly logger = new Logger(SteamInventoryProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncCache: InventorySyncCacheService,
    private readonly metrics: InventoryMetricsService,
  ) {}

  async syncInventory(
    ownerId: string,
    steamId?: string | null,
    options?: SyncInventoryOptions,
  ): Promise<SyncResult> {
    const startedAt = Date.now();
    const force = options?.force ?? false;

    if (!steamId) {
      throw new AppException(
        ErrorCode.STEAM_NOT_LINKED,
        'Link your Steam account before syncing inventory',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isRealSteamId(steamId)) {
      throw new AppException(
        ErrorCode.STEAM_NOT_LINKED,
        'Link your real Steam account before syncing inventory',
        HttpStatus.BAD_REQUEST,
      );
    }

    const latest = await this.syncCache.getLatestRun(ownerId);
    const now = new Date();

    if (latest && latest.steamId !== steamId) {
      await this.syncCache.clearRuns(ownerId);
    }

    const latestAfterSteamChange =
      latest?.steamId === steamId
        ? latest
        : await this.syncCache.getLatestRun(ownerId);

    if (
      !force &&
      latestAfterSteamChange &&
      this.syncCache.isCacheValid(latestAfterSteamChange, now)
    ) {
      const result = this.toSyncResult(latestAfterSteamChange, true, false);
      this.recordMetrics(
        'CACHE_HIT',
        startedAt,
        steamId,
        result.itemCount,
        true,
      );
      return result;
    }

    if (
      !force &&
      latestAfterSteamChange &&
      this.syncCache.isWithinRateLimit(latestAfterSteamChange, now)
    ) {
      const ageMs = now.getTime() - latestAfterSteamChange.fetchedAt.getTime();
      const withinGrace =
        latestAfterSteamChange.status === InventorySyncStatus.SUCCESS &&
        ageMs < getInventoryStaleGraceMs();
      const stale =
        !withinGrace &&
        (latestAfterSteamChange.status !== InventorySyncStatus.SUCCESS ||
          latestAfterSteamChange.expiresAt <= now);
      const result = this.toSyncResult(
        latestAfterSteamChange,
        true,
        stale,
        stale
          ? 'Не удалось обновить инвентарь из Steam — показана последняя копия'
          : null,
      );
      this.recordMetrics(
        'CACHE_HIT',
        startedAt,
        steamId,
        result.itemCount,
        true,
      );
      return result;
    }

    try {
      const response = await fetchAllSteamInventoryPages(steamId);
      const parsed = parseSteamInventoryResponse(response);
      const isPartial = response.more_items === 1;

      await this.upsertParsedAssets(ownerId, parsed);
      if (!isPartial) {
        await this.markMissingAssetsRemoved(
          ownerId,
          parsed.map((item) => item.assetExternalId),
        );
        await cleanupOrphanItemDefinitions(this.prisma);
      }

      const run = await this.syncCache.recordRun({
        userId: ownerId,
        steamId,
        status: isPartial
          ? InventorySyncStatus.PARTIAL
          : InventorySyncStatus.SUCCESS,
        itemCount: parsed.length,
      });

      const result = this.toSyncResult(run, false, false);
      this.recordMetrics(
        isPartial ? 'PARTIAL' : 'SUCCESS',
        startedAt,
        steamId,
        parsed.length,
        false,
      );
      return result;
    } catch (error) {
      const errorCode = this.resolveErrorCode(error);
      const hasCachedAssets = await this.hasCachedAssets(ownerId);

      if (latestAfterSteamChange || hasCachedAssets) {
        const run = await this.syncCache.recordRun({
          userId: ownerId,
          steamId,
          status: InventorySyncStatus.FAILED,
          itemCount: latestAfterSteamChange?.itemCount ?? 0,
          errorCode,
        });

        const result = this.toSyncResult(
          run,
          true,
          true,
          this.resolveWarning(error),
        );
        this.recordMetrics(
          'FAILED',
          startedAt,
          steamId,
          result.itemCount,
          true,
        );
        return result;
      }

      await this.syncCache.recordRun({
        userId: ownerId,
        steamId,
        status: InventorySyncStatus.FAILED,
        itemCount: 0,
        errorCode,
      });
      this.recordMetrics('FAILED', startedAt, steamId, 0, false);

      if (errorCode === ErrorCode.STEAM_PROFILE_PRIVATE) {
        throw new AppException(
          ErrorCode.STEAM_PROFILE_PRIVATE,
          'Steam inventory is private. Set your inventory to public in Steam privacy settings.',
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new AppException(
        ErrorCode.INVENTORY_STALE,
        'Inventory sync failed and no cached data is available',
        HttpStatus.SERVICE_UNAVAILABLE,
        { errorCode },
      );
    }
  }

  private async upsertParsedAssets(ownerId: string, items: ParsedSteamAsset[]) {
    for (const item of items) {
      const listableByName = isListableMarketHashName(item.marketHashName);
      const marketable = item.marketable && listableByName;
      const tradable = item.tradable && listableByName;

      const itemDefinition = await this.prisma.itemDefinition.upsert({
        where: { marketHashName: item.marketHashName },
        create: {
          marketHashName: item.marketHashName,
          game: 'CS2',
          weapon: item.weapon,
          rarity: item.rarity,
          iconUrl: item.iconUrl,
        },
        update: {
          weapon: item.weapon ?? undefined,
          rarity: item.rarity ?? undefined,
          iconUrl: item.iconUrl ?? undefined,
        },
      });

      await this.prisma.inventoryAsset.upsert({
        where: {
          ownerId_assetExternalId: {
            ownerId,
            assetExternalId: item.assetExternalId,
          },
        },
        create: {
          ownerId,
          itemDefinitionId: itemDefinition.id,
          assetExternalId: item.assetExternalId,
          status: InventoryAssetStatus.AVAILABLE,
          tradable,
          marketable,
          tradeLockUntil: item.tradeLockUntil,
          floatValue: item.floatValue,
          paintSeed: item.paintSeed,
          wear: item.wear,
          stickers: item.stickers,
          inspectLinkTemplate: item.inspectLinkTemplate,
          classExternalId: item.classExternalId,
          instanceExternalId: item.instanceExternalId,
        },
        update: {
          itemDefinitionId: itemDefinition.id,
          tradable,
          marketable,
          tradeLockUntil: item.tradeLockUntil,
          floatValue: item.floatValue,
          paintSeed: item.paintSeed,
          wear: item.wear,
          stickers: item.stickers,
          inspectLinkTemplate: item.inspectLinkTemplate,
          classExternalId: item.classExternalId,
          instanceExternalId: item.instanceExternalId,
          status: InventoryAssetStatus.AVAILABLE,
        },
      });
    }
  }

  private async markMissingAssetsRemoved(
    ownerId: string,
    activeAssetIds: string[],
  ) {
    await this.prisma.inventoryAsset.updateMany({
      where: {
        ownerId,
        status: InventoryAssetStatus.AVAILABLE,
        assetExternalId: { notIn: activeAssetIds },
        lot: null,
      },
      data: {
        status: InventoryAssetStatus.REMOVED,
      },
    });
  }

  private async hasCachedAssets(ownerId: string): Promise<boolean> {
    const count = await this.prisma.inventoryAsset.count({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
    });
    return count > 0;
  }

  private toSyncResult(
    run: {
      status: InventorySyncStatus;
      itemCount: number;
      fetchedAt: Date;
      expiresAt: Date;
      errorCode?: string | null;
    },
    cacheHit: boolean,
    stale: boolean,
    warning?: string | null,
  ): SyncResult {
    const status =
      cacheHit && run.status === InventorySyncStatus.SUCCESS
        ? 'CACHE_HIT'
        : (run.status as SyncResult['status']);

    return {
      status,
      itemCount: run.itemCount,
      fetchedAt: run.fetchedAt,
      expiresAt: run.expiresAt,
      cacheHit,
      stale,
      errorCode: run.errorCode ?? null,
      warning: warning ?? null,
    };
  }

  private resolveErrorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code: string }).code === 'string'
    ) {
      return (error as { code: string }).code;
    }
    return ErrorCode.INVENTORY_STALE;
  }

  private resolveWarning(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Steam inventory sync failed; serving cached inventory';
  }

  private recordMetrics(
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'CACHE_HIT',
    startedAt: number,
    steamId: string,
    itemCount: number,
    cacheHit: boolean,
  ): void {
    const durationMs = Date.now() - startedAt;
    this.metrics.recordSync(status, durationMs);
    this.logger.log(
      JSON.stringify({
        event: 'inventory_sync',
        steamId: maskSteamId(steamId),
        itemCount,
        cacheHit,
        status,
        durationMs,
      }),
    );
  }
}
