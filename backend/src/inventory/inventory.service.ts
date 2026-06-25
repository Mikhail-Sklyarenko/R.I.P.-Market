import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PROVIDER } from '../providers/tokens';
import type { InventoryProvider } from '../providers/inventory/inventory-provider.interface';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_PROVIDER)
    private readonly inventoryProvider: InventoryProvider,
  ) {}

  async getUserInventory(ownerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    await this.inventoryProvider.ensureInventoryForUser(ownerId, user?.steamId);

    const assets = await this.prisma.inventoryAsset.findMany({
      where: { ownerId },
      include: { itemDefinition: true },
      orderBy: { createdAt: 'desc' },
    });

    return toJsonSafe(assets);
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
