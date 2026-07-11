import { Injectable } from '@nestjs/common';
import { InventoryAssetStatus, InventorySyncStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventorySyncCacheService } from './inventory-sync-cache.service';
import {
  InventoryProvider,
  SyncInventoryOptions,
  SyncResult,
} from './inventory-provider.interface';

const DEFAULT_ITEMS = [
  {
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    weapon: 'AK-47',
    rarity: 'Classified',
    wear: 'FT',
    stickers: [
      { name: 'Sticker | Titan (Holo) | Katowice 2014', wearPercent: 12 },
      { name: 'Sticker | Crown (Foil)', wearPercent: 0 },
    ],
  },
  {
    marketHashName: 'AWP | Asiimov (Battle-Scarred)',
    weapon: 'AWP',
    rarity: 'Covert',
    wear: 'BS',
    stickers: [],
  },
  {
    marketHashName: 'M4A1-S | Printstream (Minimal Wear)',
    weapon: 'M4A1-S',
    rarity: 'Covert',
    wear: 'MW',
    stickers: [],
  },
];

@Injectable()
export class MockInventoryProvider implements InventoryProvider {
  readonly type = 'mock' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncCache: InventorySyncCacheService,
  ) {}

  async syncInventory(
    ownerId: string,
    _steamId?: string | null,
    options?: SyncInventoryOptions,
  ): Promise<SyncResult> {
    const force = options?.force ?? false;
    const latest = await this.syncCache.getLatestRun(ownerId);
    const now = new Date();

    if (!force && latest && this.syncCache.isCacheValid(latest, now)) {
      return {
        status: 'CACHE_HIT',
        itemCount: latest.itemCount,
        fetchedAt: latest.fetchedAt,
        expiresAt: latest.expiresAt,
        cacheHit: true,
        stale: false,
      };
    }

    const existingCount = await this.prisma.inventoryAsset.count({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
    });

    if (existingCount === 0) {
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
            marketable: true,
            wear: item.wear,
            paintSeed: 100 + i,
            floatValue: (0.05 + i * 0.02).toFixed(6),
            stickers: item.stickers ?? [],
          },
        });
      }
    }

    const itemCount = await this.prisma.inventoryAsset.count({
      where: {
        ownerId,
        status: { not: InventoryAssetStatus.REMOVED },
      },
    });

    if (process.env.ENABLE_MOCK_TRADE === 'true') {
      await this.prisma.inventoryAsset.updateMany({
        where: {
          ownerId,
          status: {
            in: [
              InventoryAssetStatus.SOLD,
              InventoryAssetStatus.LISTED,
              InventoryAssetStatus.RESERVED,
              InventoryAssetStatus.BLOCKED,
            ],
          },
        },
        data: { status: InventoryAssetStatus.AVAILABLE },
      });
    }

    const run = await this.syncCache.recordRun({
      userId: ownerId,
      steamId: _steamId ?? `mock-${ownerId}`,
      status: InventorySyncStatus.SUCCESS,
      itemCount,
    });

    return {
      status: existingCount > 0 && !force ? 'CACHE_HIT' : 'SUCCESS',
      itemCount,
      fetchedAt: run.fetchedAt,
      expiresAt: run.expiresAt,
      cacheHit: existingCount > 0 && !force,
      stale: false,
    };
  }
}
