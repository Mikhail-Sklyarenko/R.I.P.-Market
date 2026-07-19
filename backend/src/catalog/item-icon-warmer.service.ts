import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LotStatus } from '@prisma/client';
import { isListableMarketHashName } from '../lots/listing-eligibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { ItemIconService } from './item-icon.service';

const WARMUP_STARTUP_DELAY_MS = 25_000;
const WARMUP_BATCH = 24;
const WARMUP_ACTIVE_LOT_MAX = 40;

/**
 * Proactively fills missing ItemDefinition.iconUrl so catalog visitors
 * rarely see placeholders. Lazy catalog refresh remains a safety net.
 */
@Injectable()
export class ItemIconWarmerService implements OnModuleInit {
  private readonly logger = new Logger(ItemIconWarmerService.name);
  private startupWarmupScheduled = false;
  private catalogWarmOffset = 0;
  private warmRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly itemIcons: ItemIconService,
  ) {}

  onModuleInit(): void {
    if (!this.itemIcons.isEnabled() || this.startupWarmupScheduled) {
      return;
    }
    this.startupWarmupScheduled = true;
    setTimeout(() => {
      void this.warmMissingIcons('startup');
    }, WARMUP_STARTUP_DELAY_MS);
  }

  @Cron('*/7 * * * *')
  async warmOnSchedule(): Promise<void> {
    await this.warmMissingIcons('cron');
  }

  async warmMissingIcons(
    trigger: 'startup' | 'cron' | 'manual',
  ): Promise<number> {
    if (!this.itemIcons.isEnabled() || this.warmRunning) {
      return 0;
    }
    if (this.itemIcons.isSteamBlocked()) {
      this.logger.debug(
        `Item icon warmup (${trigger}) skipped: Steam temporarily blocked`,
      );
      return 0;
    }

    this.warmRunning = true;
    const startedAt = Date.now();
    try {
      // Cheap DB-only pass first (snapshots → definitions).
      const fromSnapshots = await this.itemIcons.backfillMissingFromSnapshots();

      const targets = await this.collectMissingDefinitions();
      let fromSteam = 0;
      if (targets.length > 0) {
        fromSteam = await this.itemIcons.refreshMissingIcons(targets);
      }

      const updated = fromSnapshots + fromSteam;
      if (updated > 0 || targets.length > 0) {
        this.logger.log(
          `Item icon warmup (${trigger}): snapshots=${fromSnapshots} steam=${fromSteam} targets=${targets.length} in ${
            Date.now() - startedAt
          }ms`,
        );
      }
      return updated;
    } catch (error) {
      this.logger.warn(
        `Item icon warmup (${trigger}) failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return 0;
    } finally {
      this.warmRunning = false;
    }
  }

  private async collectMissingDefinitions(): Promise<
    Array<{ id: string; marketHashName: string }>
  > {
    const missingWhere = {
      OR: [{ iconUrl: null }, { iconUrl: '' }],
    };

    const [activeLotDefs, catalogBatch] = await Promise.all([
      this.prisma.lot.findMany({
        where: {
          status: LotStatus.ACTIVE,
          inventoryAsset: {
            itemDefinition: missingWhere,
          },
        },
        select: {
          inventoryAsset: {
            select: {
              itemDefinition: {
                select: { id: true, marketHashName: true },
              },
            },
          },
        },
        take: WARMUP_ACTIVE_LOT_MAX,
      }),
      this.prisma.itemDefinition.findMany({
        where: missingWhere,
        select: { id: true, marketHashName: true },
        orderBy: { updatedAt: 'asc' },
        skip: this.catalogWarmOffset,
        take: WARMUP_BATCH,
      }),
    ]);

    if (catalogBatch.length < WARMUP_BATCH) {
      this.catalogWarmOffset = 0;
    } else {
      this.catalogWarmOffset += catalogBatch.length;
    }

    const result: Array<{ id: string; marketHashName: string }> = [];
    const seen = new Set<string>();

    const push = (row: { id: string; marketHashName: string } | null | undefined) => {
      if (!row || seen.has(row.id)) {
        return;
      }
      if (!isListableMarketHashName(row.marketHashName)) {
        return;
      }
      seen.add(row.id);
      result.push(row);
    };

    for (const lot of activeLotDefs) {
      push(lot.inventoryAsset.itemDefinition);
    }
    for (const item of catalogBatch) {
      push(item);
    }

    return result.slice(0, WARMUP_BATCH);
  }
}
