import { CatalogPriceBulkImportService } from './catalog-price-bulk-import.service';
import { SteamMarketPriceService } from './steam-market-price.service';

describe('CatalogPriceBulkImportService (Steam-direct)', () => {
  const previousGap = process.env.STEAM_CATALOG_PRICE_GAP_MS;

  beforeEach(() => {
    process.env.STEAM_CATALOG_PRICE_GAP_MS = '0';
  });

  afterEach(() => {
    if (previousGap === undefined) {
      delete process.env.STEAM_CATALOG_PRICE_GAP_MS;
    } else {
      process.env.STEAM_CATALOG_PRICE_GAP_MS = previousGap;
    }
  });

  it('fetches Steam prices for catalog cards and upserts cache', async () => {
    const fetchSteamPriceMinorOnly = jest
      .fn()
      .mockResolvedValueOnce(14783)
      .mockResolvedValueOnce(5000);
    const steamPrices = {
      fetchSteamPriceMinorOnly,
      isSteamBlocked: jest.fn().mockReturnValue(false),
    } as unknown as SteamMarketPriceService;

    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            marketHashName: 'AK-47 | Bloodsport',
            availableWears: ['FN', 'FT', 'MW'],
          },
          { marketHashName: 'Sticker | Titan', availableWears: [] },
        ]),
      },
      steamPriceCache: { upsert },
    };

    const service = new CatalogPriceBulkImportService(
      prisma as never,
      steamPrices,
    );

    const result = await service.importCatalogPrices();

    expect(result.source).toBe('steam');
    expect(result.catalogTotal).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.failed).toBe(0);
    expect(fetchSteamPriceMinorOnly).toHaveBeenCalledWith(
      'AK-47 | Bloodsport (Field-Tested)',
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { marketHashName: 'AK-47 | Bloodsport' },
        create: expect.objectContaining({ priceMinor: 14783 }),
      }),
    );
  });
});
