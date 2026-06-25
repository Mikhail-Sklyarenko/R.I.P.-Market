import { Injectable } from '@nestjs/common';
import { InventoryAssetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryProvider } from './inventory-provider.interface';

const DEFAULT_ITEMS = [
  {
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    weapon: 'AK-47',
    rarity: 'Classified',
    wear: 'FT',
  },
  {
    marketHashName: 'AWP | Asiimov (Battle-Scarred)',
    weapon: 'AWP',
    rarity: 'Covert',
    wear: 'BS',
  },
  {
    marketHashName: 'M4A1-S | Printstream (Minimal Wear)',
    weapon: 'M4A1-S',
    rarity: 'Covert',
    wear: 'MW',
  },
];

@Injectable()
export class MockInventoryProvider implements InventoryProvider {
  readonly type = 'mock' as const;

  constructor(private readonly prisma: PrismaService) {}

  async ensureInventoryForUser(ownerId: string): Promise<void> {
    const existingCount = await this.prisma.inventoryAsset.count({
      where: { ownerId },
    });

    if (existingCount > 0) {
      return;
    }

    for (let i = 0; i < DEFAULT_ITEMS.length; i += 1) {
      const item = DEFAULT_ITEMS[i];
      const itemDefinition = await this.prisma.itemDefinition.upsert({
        where: { marketHashName: item.marketHashName },
        create: {
          marketHashName: item.marketHashName,
          game: 'CS2',
          weapon: item.weapon,
          rarity: item.rarity,
        },
        update: {},
      });

      await this.prisma.inventoryAsset.create({
        data: {
          ownerId,
          itemDefinitionId: itemDefinition.id,
          assetExternalId: `mock-${ownerId}-${i + 1}`,
          status: InventoryAssetStatus.AVAILABLE,
          tradable: true,
          wear: item.wear,
          paintSeed: 100 + i,
          floatValue: (0.05 + i * 0.02).toFixed(6),
        },
      });
    }
  }
}
