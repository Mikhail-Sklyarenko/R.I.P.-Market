import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveAllWearSteamMarketNames,
  resolveCatalogCardDisplaySteamPriceName,
} from './catalog-steam-price-names.util';
import { SteamMarketPriceService } from './steam-market-price.service';

export type CatalogPriceImportProgress = {
  processed: number;
  total: number;
  matched: number;
  failed: number;
  steamRequests: number;
};

export type CatalogPriceImportResult = {
  catalogTotal: number;
  matched: number;
  failed: number;
  steamRequests: number;
  source: 'steam';
  fetchedAt: string;
  stoppedEarly?: boolean;
  stopReason?: string;
};

/** Safer than live warmer gap — full catalog runs for hours. */
const DEFAULT_CATALOG_STEAM_GAP_MS = 150;

@Injectable()
export class CatalogPriceBulkImportService {
  private readonly logger = new Logger(CatalogPriceBulkImportService.name);
  private abortRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly steamPrices: SteamMarketPriceService,
  ) {}

  requestAbort(): void {
    this.abortRequested = true;
  }

  clearAbort(): void {
    this.abortRequested = false;
  }

  async importCatalogPrices(options?: {
    onProgress?: (progress: CatalogPriceImportProgress) => void;
    shouldAbort?: () => boolean;
  }): Promise<CatalogPriceImportResult> {
    this.abortRequested = false;
    const startedAt = Date.now();
    const gapMs = this.resolveGapMs();

    const catalogItems = await this.prisma.itemDefinition.findMany({
      where: { game: 'CS2', catalogSeeded: true },
      select: { marketHashName: true, availableWears: true },
      orderBy: { marketHashName: 'asc' },
    });

    let matched = 0;
    let failed = 0;
    let steamRequests = 0;
    let stoppedEarly = false;
    let stopReason: string | undefined;

    const progress = (): CatalogPriceImportProgress => ({
      processed: matched + failed,
      total: catalogItems.length,
      matched,
      failed,
      steamRequests,
    });

    options?.onProgress?.(progress());

    for (const item of catalogItems) {
      if (this.abortRequested || options?.shouldAbort?.()) {
        stoppedEarly = true;
        stopReason = 'aborted';
        break;
      }
      if (this.steamPrices.isSteamBlocked()) {
        stoppedEarly = true;
        stopReason = 'steam_blocked';
        this.logger.warn(
          `Catalog Steam price import paused: Steam blocked after ${matched + failed}/${catalogItems.length}`,
        );
        break;
      }

      const namesToFetch = resolveAllWearSteamMarketNames(
        item.marketHashName,
        item.availableWears,
      );
      const displayName = resolveCatalogCardDisplaySteamPriceName(
        item.marketHashName,
        item.availableWears,
      );

      const wearPrices = new Map<string, number>();
      for (const steamName of namesToFetch) {
        if (this.abortRequested || options?.shouldAbort?.()) {
          break;
        }
        if (this.steamPrices.isSteamBlocked()) {
          break;
        }
        const priceMinor =
          await this.steamPrices.fetchSteamPriceMinorOnly(steamName);
        steamRequests += 1;
        await sleep(gapMs);
        if (priceMinor != null) {
          wearPrices.set(steamName, priceMinor);
        }
      }

      if (wearPrices.size > 0) {
        const fetchedAt = new Date();
        for (const [steamName, priceMinor] of wearPrices) {
          await this.prisma.steamPriceCache.upsert({
            where: { marketHashName: steamName },
            create: {
              marketHashName: steamName,
              priceMinor,
              fetchedAt,
            },
            update: { priceMinor, fetchedAt },
          });
        }

        const displayPrice =
          wearPrices.get(displayName) ?? wearPrices.values().next().value;
        if (displayPrice != null) {
          await this.prisma.steamPriceCache.upsert({
            where: { marketHashName: item.marketHashName },
            create: {
              marketHashName: item.marketHashName,
              priceMinor: displayPrice,
              fetchedAt,
            },
            update: { priceMinor: displayPrice, fetchedAt },
          });
        }

        matched += 1;
      } else {
        failed += 1;
      }

      if ((matched + failed) % 25 === 0 || matched + failed === catalogItems.length) {
        options?.onProgress?.(progress());
      }
    }

    options?.onProgress?.(progress());

    const result: CatalogPriceImportResult = {
      catalogTotal: catalogItems.length,
      matched,
      failed,
      steamRequests,
      source: 'steam',
      fetchedAt: new Date().toISOString(),
      ...(stoppedEarly ? { stoppedEarly: true, stopReason } : {}),
    };

    this.logger.log(
      `Catalog Steam price import: matched ${result.matched}/${result.catalogTotal} failed=${result.failed} steamRequests=${result.steamRequests} stopped=${stoppedEarly ? stopReason : 'no'} in ${
        Date.now() - startedAt
      }ms`,
    );

    return result;
  }

  private resolveGapMs(): number {
    const raw = Number(process.env.STEAM_CATALOG_PRICE_GAP_MS);
    if (Number.isFinite(raw) && raw >= 0 && raw <= 5_000) {
      return Math.round(raw);
    }
    return DEFAULT_CATALOG_STEAM_GAP_MS;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
