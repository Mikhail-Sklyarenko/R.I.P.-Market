import { CatalogPriceBulkImportService } from './catalog-price-bulk-import.service';
import { SteamMarketPriceService } from './steam-market-price.service';

describe('CatalogPriceBulkImportService', () => {
  it('maps snapshot prices to catalog items and upserts cache', async () => {
    const snapshot = new Map<string, number>([
      ['AK-47 | Redline (Field-Tested)', 900],
      ['Sticker | Titan', 5000],
    ]);

    const steamPrices = {
      fetchBulkSnapshotPrices: jest.fn().mockResolvedValue(snapshot),
    } as unknown as SteamMarketPriceService;

    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { marketHashName: 'AK-47 | Redline' },
          { marketHashName: 'Sticker | Titan' },
        ]),
      },
      steamPriceCache: { upsert },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const service = new CatalogPriceBulkImportService(
      prisma as never,
      steamPrices,
    );

    const result = await service.importCatalogPrices();

    expect(result.catalogTotal).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.snapshotSize).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { marketHashName: 'AK-47 | Redline' },
        create: expect.objectContaining({ priceMinor: 900 }),
      }),
    );
  });
});
