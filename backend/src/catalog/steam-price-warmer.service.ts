import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LotStatus, OrderStatus } from '@prisma/client';
import { isListableMarketHashName } from '../lots/listing-eligibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { SteamMarketPriceService } from './steam-market-price.service';

const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const WARMUP_STARTUP_DELAY_MS = 15_000;
const WARMUP_PRIORITY_MAX = 40;
const WARMUP_CATALOG_BATCH = 36;
const WARMUP_TOTAL_MAX = 60;

@Injectable()
export class SteamPriceWarmerService implements OnModuleInit {
  private readonly logger = new Logger(SteamPriceWarmerService.name);
  private startupWarmupScheduled = false;
  private catalogWarmOffset = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly steamMarketPrice: SteamMarketPriceService,
  ) {}

  onModuleInit(): void {
    if (!this.steamMarketPrice.isEnabled() || this.startupWarmupScheduled) {
      return;
    }
    this.startupWarmupScheduled = true;
    void this.prisma.steamPriceCache
      .deleteMany({ where: { priceMinor: null } })
      .catch(() => undefined);
    setTimeout(() => {
      void this.warmPriorityItems('startup');
    }, WARMUP_STARTUP_DELAY_MS);
  }

  @Cron('*/5 * * * *')
  async warmOnSchedule(): Promise<void> {
    await this.warmPriorityItems('cron');
  }

  async warmPriorityItems(trigger: 'startup' | 'cron' | 'manual'): Promise<void> {
    if (!this.steamMarketPrice.isEnabled()) {
      return;
    }

    const names = await this.collectPriorityMarketHashNames();
    if (names.length === 0) {
      return;
    }

    const startedAt = Date.now();
    const prices = await this.steamMarketPrice.getPricesWithMeta(names);
    const resolved = Object.values(prices).filter(
      (entry) => entry.priceMinor != null,
    ).length;

    this.logger.log(
      `Steam price warmup (${trigger}): resolved ${resolved}/${names.length} in ${Date.now() - startedAt}ms`,
    );
  }

  private async collectPriorityMarketHashNames(): Promise<string[]> {
    const since = new Date(Date.now() - POPULAR_WINDOW_MS);
    const [activeLots, recentOrders, catalogBatch] = await Promise.all([
      this.prisma.lot.findMany({
        where: { status: LotStatus.ACTIVE },
        select: {
          inventoryAsset: {
            select: {
              itemDefinition: {
                select: { marketHashName: true },
              },
            },
          },
        },
        take: WARMUP_PRIORITY_MAX,
      }),
      this.prisma.order.findMany({
        where: {
          status: {
            in: [
              OrderStatus.COMPLETED,
              OrderStatus.WAITING_TRADE,
              OrderStatus.TRADE_CONFIRMED,
            ],
          },
          createdAt: { gte: since },
        },
        select: {
          lot: {
            select: {
              inventoryAsset: {
                select: {
                  itemDefinition: {
                    select: { marketHashName: true },
                  },
                },
              },
            },
          },
        },
        take: WARMUP_PRIORITY_MAX,
      }),
      this.prisma.itemDefinition.findMany({
        select: { marketHashName: true },
        orderBy: { marketHashName: 'asc' },
        skip: this.catalogWarmOffset,
        take: WARMUP_CATALOG_BATCH,
      }),
    ]);

    if (catalogBatch.length < WARMUP_CATALOG_BATCH) {
      this.catalogWarmOffset = 0;
    } else {
      this.catalogWarmOffset += catalogBatch.length;
    }

    const names: string[] = [];
    const seen = new Set<string>();

    const pushName = (name: string | null | undefined) => {
      if (!name || seen.has(name)) {
        return;
      }
      seen.add(name);
      names.push(name);
    };

    for (const lot of activeLots) {
      pushName(lot.inventoryAsset.itemDefinition.marketHashName);
    }
    for (const order of recentOrders) {
      pushName(order.lot.inventoryAsset.itemDefinition.marketHashName);
    }

    const skinBatch = catalogBatch.filter(
      (item) =>
        isListableMarketHashName(item.marketHashName) &&
        item.marketHashName.includes(' | '),
    );
    const otherBatch = catalogBatch.filter(
      (item) =>
        isListableMarketHashName(item.marketHashName) &&
        !item.marketHashName.includes(' | '),
    );
    for (const item of [...skinBatch, ...otherBatch]) {
      pushName(item.marketHashName);
    }

    return names.slice(0, WARMUP_TOTAL_MAX);
  }
}
