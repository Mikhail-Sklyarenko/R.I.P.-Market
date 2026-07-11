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

    try {
      await this.inventoryProvider.syncInventory(sellerId, sellerSteamId, {
        force,
      });
      await this.inventoryProvider.syncInventory(buyerId, buyerSteamId, {
        force,
      });
    } catch {
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
  ) {
    const where: {
      ownerId: string;
      status: InventoryAssetStatus;
      itemDefinition: { marketHashName: string };
      floatValue?: number;
      paintSeed?: number;
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

    return this.prisma.inventoryAsset.findFirst({ where });
  }
}
