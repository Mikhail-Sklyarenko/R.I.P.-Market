import { Injectable } from '@nestjs/common';
import { InventoryAssetStatus, InventorySyncStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventorySyncCacheService } from './inventory-sync-cache.service';
import {
  InventoryProvider,
  SyncInventoryOptions,
  SyncResult,
} from './inventory-provider.interface';

/**
 * Steam economy icon hashes for mock catalog skins.
 * Without these, ItemDefinition.iconUrl stays null and the UI shows an empty placeholder.
 */
const DEFAULT_ITEMS = [
  {
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    weapon: 'AK-47',
    rarity: 'Classified',
    wear: 'FT',
    // Full CDN URL — mock defs historically had null iconUrl and looked "empty" in catalog.
    iconUrl:
      'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSI_-RHGavzedxuPUnFniykEtzsWWBzoyuIiifaAchDZUjTOZe4RC_w4buM-6z7wzbgokUyzK-0H08hRGDMA',
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
    iconUrl:
      'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0n_L1JbTZk2pH7JYj2O2T9I-i0ALtrUVqY2GhLdSccgM6aAvQ_FW8xOfug5G-vM7XiSw0abc',
    stickers: [],
  },
  {
    marketHashName: 'M4A1-S | Printstream (Minimal Wear)',
    weapon: 'M4A1-S',
    rarity: 'Covert',
    wear: 'MW',
    iconUrl:
      'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alDL_UlW8u5MKji7-TpN-s2wTm-0o5Ym-lddSWdQY5N1_S-le_xui605e76J_Kz3J9r_M',
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
            iconUrl: item.iconUrl,
          },
          update: {
            weapon: item.weapon,
            rarity: item.rarity,
            iconUrl: item.iconUrl,
          },
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
    } else {
      // Backfill icons for definitions created before mock items had iconUrl.
      for (const item of DEFAULT_ITEMS) {
        await this.prisma.itemDefinition.updateMany({
          where: {
            marketHashName: item.marketHashName,
            OR: [{ iconUrl: null }, { iconUrl: '' }],
          },
          data: {
            iconUrl: item.iconUrl,
            weapon: item.weapon,
            rarity: item.rarity,
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
