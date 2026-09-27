import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InventoryAssetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type {
  InventoryProvider,
  SyncResult,
} from '../providers/inventory/inventory-provider.interface';

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

    let sellerSync: SyncResult;
    let buyerSync: SyncResult;
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
      sellerSync.status === 'PARTIAL' ||
      buyerSync.status === 'PARTIAL' ||
      sellerSync.stale ||
      buyerSync.stale
    ) {
      return 'unknown';
    }

    // Marketplace RESERVED/LISTED rows are not evidence of live Steam presence.
    // Require complete fresh observations for the real provider.
    if (this.inventoryProvider.type === 'steam') {
      if (!sellerSync.observedAssetIds || !buyerSync.observedAssetIds)
        return 'unknown';
      if (sellerSync.observedAssetIds.includes(expectedAssetExternalId))
        return 'seller_still_holds';
      return buyerSync.observedAssetIds.includes(expectedAssetExternalId)
        ? 'confirmed'
        : 'pending';
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
    if (buyerByAssetId && !sellerLiveHolds) {
      return 'confirmed';
    }

    // A name/float/seed match (even newly synced) cannot establish this transfer:
    // another trade or an old item first imported today can match. Require exact
    // asset evidence here. A changed Steam asset ID requires an authoritative
    // transfer mapping; neither a receipt nor a matching item name substitutes it.

    if (sellerLiveHolds) {
      return 'seller_still_holds';
    }

    return 'pending';
  }
}
