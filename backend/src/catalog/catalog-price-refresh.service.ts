import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogPriceBulkImportService,
  type CatalogPriceImportProgress,
  type CatalogPriceImportResult,
} from './catalog-price-bulk-import.service';

export type CatalogPriceRefreshStatus = {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  trigger?: 'manual' | 'cron';
  source?: 'steam';
  startedAt?: string;
  finishedAt?: string;
  progress?: CatalogPriceImportProgress;
  result?: CatalogPriceImportResult;
  error?: string;
  estimatedDurationHint?: string;
  cacheSummary?: {
    cachedItems: number;
    latestFetchedAt: string | null;
  };
};

@Injectable()
export class CatalogPriceRefreshService implements OnModuleInit {
  private readonly logger = new Logger(CatalogPriceRefreshService.name);
  private running = false;
  private state: CatalogPriceRefreshStatus = {
    status: 'idle',
    source: 'steam',
    estimatedDurationHint: '3–5 часов при полном прогоне каталога',
  };

  constructor(
    private readonly bulkImport: CatalogPriceBulkImportService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    void this.refreshCacheSummary();
  }

  isEnabled(): boolean {
    return process.env.CATALOG_PRICE_BULK_REFRESH_ENABLED !== 'false';
  }

  isRunning(): boolean {
    return this.running;
  }

  async getStatus(): Promise<CatalogPriceRefreshStatus> {
    if (this.state.status !== 'running') {
      await this.refreshCacheSummary();
    }
    return {
      ...this.state,
      source: 'steam',
      estimatedDurationHint: '3–5 часов при полном прогоне каталога',
    };
  }

  startManualRefresh(): Promise<CatalogPriceRefreshStatus> {
    if (this.running) {
      return Promise.resolve({ ...this.state });
    }
    void this.runRefresh('manual');
    return this.getStatus();
  }

  stopRefresh(): CatalogPriceRefreshStatus {
    if (this.running) {
      this.bulkImport.requestAbort();
    }
    return { ...this.state };
  }

  /** 1st and 15th of month at 04:00 — bi-weekly Steam refresh. */
  @Cron('0 4 1,15 * *')
  async refreshOnSchedule(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.runRefresh('cron');
  }

  private async runRefresh(trigger: 'manual' | 'cron'): Promise<void> {
    if (this.running) {
      this.logger.debug(`Catalog price refresh (${trigger}) skipped: already running`);
      return;
    }
    if (!this.steamPricesEnabled()) {
      this.logger.warn(`Catalog price refresh (${trigger}) skipped: Steam prices disabled`);
      return;
    }

    this.running = true;
    this.bulkImport.clearAbort();
    this.state = {
      status: 'running',
      trigger,
      source: 'steam',
      startedAt: new Date().toISOString(),
      estimatedDurationHint: '3–5 часов при полном прогоне каталога',
      progress: {
        processed: 0,
        total: 0,
        matched: 0,
        failed: 0,
        steamRequests: 0,
      },
      cacheSummary: this.state.cacheSummary,
    };

    try {
      const result = await this.bulkImport.importCatalogPrices({
        onProgress: (progress) => {
          this.state = { ...this.state, progress };
        },
      });
      await this.refreshCacheSummary();

      const status: CatalogPriceRefreshStatus['status'] = result.stoppedEarly
        ? 'stopped'
        : 'completed';

      this.state = {
        status,
        trigger,
        source: 'steam',
        startedAt: this.state.startedAt,
        finishedAt: new Date().toISOString(),
        result,
        progress: {
          processed: result.matched + result.failed,
          total: result.catalogTotal,
          matched: result.matched,
          failed: result.failed,
          steamRequests: result.steamRequests,
        },
        estimatedDurationHint: '3–5 часов при полном прогоне каталога',
        cacheSummary: this.state.cacheSummary,
        ...(result.stopReason === 'steam_blocked'
          ? {
              error:
                'Steam временно заблокировал IP (403). Кэш сохранён; повторите позже.',
            }
          : {}),
      };
      this.logger.log(
        `Catalog price refresh (${trigger}) ${status}: ${result.matched}/${result.catalogTotal}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Catalog price refresh failed';
      this.state = {
        status: 'failed',
        trigger,
        source: 'steam',
        startedAt: this.state.startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
        estimatedDurationHint: '3–5 часов при полном прогоне каталога',
        cacheSummary: this.state.cacheSummary,
      };
      this.logger.error(`Catalog price refresh (${trigger}) failed: ${message}`);
    } finally {
      this.running = false;
      this.bulkImport.clearAbort();
    }
  }

  private steamPricesEnabled(): boolean {
    return process.env.STEAM_MARKET_PRICE_ENABLED !== 'false';
  }

  private async refreshCacheSummary(): Promise<void> {
    const [cachedItems, latest] = await Promise.all([
      this.prisma.steamPriceCache.count({
        where: { priceMinor: { not: null } },
      }),
      this.prisma.steamPriceCache.findFirst({
        where: { priceMinor: { not: null } },
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      }),
    ]);

    this.state = {
      ...this.state,
      cacheSummary: {
        cachedItems,
        latestFetchedAt: latest?.fetchedAt.toISOString() ?? null,
      },
    };
  }
}
