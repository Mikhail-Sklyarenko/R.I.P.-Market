import { SteamMarketPriceService } from './steam-market-price.service';

function createService() {
  const prisma = {
    steamPriceCache: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  return {
    service: new SteamMarketPriceService(prisma as never),
    prisma,
  };
}

describe('SteamMarketPriceService', () => {
  const originalEnabled = process.env.STEAM_MARKET_PRICE_ENABLED;

  afterEach(() => {
    process.env.STEAM_MARKET_PRICE_ENABLED = originalEnabled;
    jest.restoreAllMocks();
  });

  it('returns deterministic mock prices when Steam market pricing is disabled', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'false';
    const { service } = createService();

    const result = await service.getPricesWithMeta([
      'AK-47 | Redline (Field-Tested)',
      'Revolution Case',
    ]);

    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBeGreaterThan(
      0,
    );
    expect(result['Revolution Case']?.priceMinor).toBeGreaterThan(0);
    expect(result['AK-47 | Redline (Field-Tested)']?.fetchedAt).toBeTruthy();
  });

  it('retries Steam market fetch before returning null', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service, prisma } = createService();
    const requestMock = jest
      .spyOn(service as never, 'requestSteamPriceOverview' as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        success: true,
        lowest_price: '$12.34',
      });

    const result = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)'], {
      forceRefresh: true,
    });

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(1234);
    expect(prisma.steamPriceCache.upsert).toHaveBeenCalled();
  });

  it('reuses stale cached price when refresh fails', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service } = createService();
    const memoryCache = (
      service as unknown as {
        memoryCache: Map<
          string,
          { priceMinor: number | null; fetchedAt: number; expiresAt: number }
        >;
      }
    ).memoryCache;

    memoryCache.set('AK-47 | Redline (Field-Tested)', {
      priceMinor: 2500,
      fetchedAt: Date.now() - 60_000,
      expiresAt: Date.now() - 1,
    });

    jest
      .spyOn(service as never, 'requestSteamPriceOverview' as never)
      .mockResolvedValue(null);

    const result = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)']);

    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(2500);
  });

  it('reads prices from database cache without calling Steam when cacheOnly', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service, prisma } = createService();
    prisma.steamPriceCache.findMany.mockResolvedValue([
      {
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        priceMinor: 4140,
        fetchedAt: new Date('2026-07-13T12:00:00.000Z'),
      },
    ]);
    const requestMock = jest.spyOn(
      service as never,
      'requestSteamPriceOverview' as never,
    );

    const result = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)'], {
      cacheOnly: true,
    });

    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(4140);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
