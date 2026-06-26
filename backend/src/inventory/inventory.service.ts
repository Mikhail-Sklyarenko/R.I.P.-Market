import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryAssetStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type {
  InventoryProvider,
  SyncResult,
} from '../providers/inventory/inventory-provider.interface';

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
}
