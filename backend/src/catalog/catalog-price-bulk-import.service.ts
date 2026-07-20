import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateMinPriceByBaseName,
  resolveCatalogSteamPriceMinor,
} from './catalog-price-snapshot.util';
import { SteamMarketPriceService } from './steam-market-price.service';

export type CatalogPriceImportProgress = {
  processed: number;
  total: number;
  matched: number;
};

export type CatalogPriceImportResult = {
  catalogTotal: number;
  matched: number;
  snapshotSize: number;
  fetchedAt: string;
};

const UPSERT_BATCH_SIZE = 100;

@Injectable()
export class CatalogPriceBulkImportService {
  private readonly logger = new Logger(CatalogPriceBulkImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly steamPrices: SteamMarketPriceService,
  ) {}

  async importCatalogPrices(options?: {
    onProgress?: (progress: CatalogPriceImportProgress) => void;
  }): Promise<CatalogPriceImportResult> {
    const startedAt = Date.now();
    const snapshot = await this.steamPrices.fetchBulkSnapshotPrices({
      refresh: true,
    });
    const basePrices = aggregateMinPriceByBaseName(snapshot);

    const catalogItems = await this.prisma.itemDefinition.findMany({
      where: { game: 'CS2', catalogSeeded: true },
      select: { marketHashName: true },
    });

    const upserts: Array<{ marketHashName: string; priceMinor: number }> = [];
    for (const item of catalogItems) {
      const priceMinor = resolveCatalogSteamPriceMinor(
        item.marketHashName,
        snapshot,
        basePrices,
      );
      if (priceMinor != null) {
        upserts.push({ marketHashName: item.marketHashName, priceMinor });
      }
    }

    const fetchedAt = new Date();
    await this.batchUpsertPrices(upserts, fetchedAt, options?.onProgress);

    const result: CatalogPriceImportResult = {
      catalogTotal: catalogItems.length,
      matched: upserts.length,
      snapshotSize: snapshot.size,
      fetchedAt: fetchedAt.toISOString(),
    };

    this.logger.log(
      `Catalog price bulk import: matched ${result.matched}/${result.catalogTotal} from snapshot ${result.snapshotSize} in ${
        Date.now() - startedAt
      }ms`,
    );

    return result;
  }

  private async batchUpsertPrices(
    items: Array<{ marketHashName: string; priceMinor: number }>,
    fetchedAt: Date,
    onProgress?: (progress: CatalogPriceImportProgress) => void,
  ): Promise<void> {
    onProgress?.({ processed: 0, total: items.length, matched: items.length });

    for (let offset = 0; offset < items.length; offset += UPSERT_BATCH_SIZE) {
      const chunk = items.slice(offset, offset + UPSERT_BATCH_SIZE);
      await this.prisma.$transaction(
        chunk.map(({ marketHashName, priceMinor }) =>
          this.prisma.steamPriceCache.upsert({
            where: { marketHashName },
            create: { marketHashName, priceMinor, fetchedAt },
            update: { priceMinor, fetchedAt },
          }),
        ),
      );
      onProgress?.({
        processed: Math.min(offset + chunk.length, items.length),
        total: items.length,
        matched: items.length,
      });
    }
  }
}
