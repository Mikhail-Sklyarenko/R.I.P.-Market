import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InventoryAssetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type { InventoryProvider } from '../providers/inventory/inventory-provider.interface';

export type InventoryDeltaResult =
  | 'pending'
  | 'confirmed'
  | 'seller_still_holds'
  | 'unknown';

export type InventoryDeltaVerifyOptions = {
  force?: boolean;
  expectedFloatValue?: number | null;
  expectedPaintSeed?: number | null;
  /** Used for fungible items (cases, keys) where asset id changes after trade. */
  orderCreatedAt?: Date;
};

@Injectable()
export class TradeInventoryDeltaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_PROVIDER)
    private readonly inventoryProvider: InventoryProvider,
  ) {}

  async verify(
    sellerId: string,
    buyerId: string,
    sellerSteamId: string | null | undefined,
    buyerSteamId: string | null | undefined,
    expectedAssetExternalId: string,
    marketHashName: string,
    options?: InventoryDeltaVerifyOptions,
  ): Promise<InventoryDeltaResult> {
    if (!sellerSteamId || !buyerSteamId) {
      return 'unknown';
    }

    const force = options?.force ?? false;

    let sellerSync;
    let buyerSync;
    try {
      sellerSync = await this.inventoryProvider.syncInventory(
        sellerId,
        sellerSteamId,
        { force },
      );
      buyerSync = await this.inventoryProvider.syncInventory(
        buyerId,
        buyerSteamId,
        { force },
      );
    } catch {
      return 'unknown';
    }

    // Failed/stale syncs keep pre-trade DB rows — do not treat that as seller_still_holds.
    if (
      sellerSync.status === 'FAILED' ||
      buyerSync.status === 'FAILED' ||
      sellerSync.stale ||
      buyerSync.stale
    ) {
      return 'unknown';
    }

    const sellerLiveHolds = await this.prisma.inventoryAsset.findFirst({
      where: {
        ownerId: sellerId,
        assetExternalId: expectedAssetExternalId,
        status: InventoryAssetStatus.AVAILABLE,
      },
    });

    const buyerByAssetId = await this.prisma.inventoryAsset.findFirst({
      where: {
        ownerId: buyerId,
        assetExternalId: expectedAssetExternalId,
        status: InventoryAssetStatus.AVAILABLE,
        itemDefinition: { marketHashName },
      },
    });
    if (buyerByAssetId) {
      return 'confirmed';
    }

    const buyerByHashName = await this.findBuyerReceivedByHashName(
      buyerId,
      marketHashName,
      options?.expectedFloatValue,
      options?.expectedPaintSeed,
      options?.orderCreatedAt,
    );
    if (buyerByHashName && !sellerLiveHolds) {
      return 'confirmed';
    }

    if (sellerLiveHolds) {
      return 'seller_still_holds';
    }

    return 'pending';
  }

  private async findBuyerReceivedByHashName(
    buyerId: string,
    marketHashName: string,
    expectedFloatValue?: number | null,
    expectedPaintSeed?: number | null,
    orderCreatedAt?: Date,
  ) {
    const hasUniqueMatchHints =
      (expectedFloatValue != null && Number.isFinite(expectedFloatValue)) ||
      (expectedPaintSeed != null && Number.isFinite(expectedPaintSeed));

    const where: {
      ownerId: string;
      status: InventoryAssetStatus;
      itemDefinition: { marketHashName: string };
      floatValue?: number;
      paintSeed?: number;
      createdAt?: { gte: Date };
    } = {
      ownerId: buyerId,
      status: InventoryAssetStatus.AVAILABLE,
      itemDefinition: { marketHashName },
    };

    if (expectedFloatValue != null && Number.isFinite(expectedFloatValue)) {
      where.floatValue = expectedFloatValue;
    }
    if (expectedPaintSeed != null && Number.isFinite(expectedPaintSeed)) {
      where.paintSeed = expectedPaintSeed;
    }
    if (!hasUniqueMatchHints && orderCreatedAt) {
      where.createdAt = { gte: orderCreatedAt };
    }

    return this.prisma.inventoryAsset.findFirst({ where });
  }
}
