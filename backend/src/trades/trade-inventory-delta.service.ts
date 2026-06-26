import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type { InventoryProvider } from '../providers/inventory/inventory-provider.interface';

export type InventoryDeltaResult =
  | 'pending'
  | 'confirmed'
  | 'seller_still_holds'
  | 'unknown';

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
  ): Promise<InventoryDeltaResult> {
    if (!sellerSteamId || !buyerSteamId) {
      return 'unknown';
    }

    await this.inventoryProvider.syncInventory(sellerId, sellerSteamId, {
      force: false,
    });
    await this.inventoryProvider.syncInventory(buyerId, buyerSteamId, {
      force: false,
    });

    const sellerStillHas = await this.prisma.inventoryAsset.findFirst({
      where: {
        ownerId: sellerId,
        assetExternalId: expectedAssetExternalId,
        status: { in: ['AVAILABLE', 'LISTED', 'RESERVED'] },
      },
    });
    if (sellerStillHas) {
      return 'seller_still_holds';
    }

    const buyerReceived = await this.prisma.inventoryAsset.findFirst({
      where: {
        ownerId: buyerId,
        assetExternalId: expectedAssetExternalId,
        itemDefinition: { marketHashName },
      },
    });
    if (buyerReceived) {
      return 'confirmed';
    }

    return 'pending';
  }
}
