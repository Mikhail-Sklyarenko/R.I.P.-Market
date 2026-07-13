import {
  SteamMarketPriceService,
  SteamRateLimitError,
} from './steam-market-price.service';

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

  it('does not retry a definitive empty Steam response', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service, prisma } = createService();
    const requestMock = jest
      .spyOn(service as never, 'requestSteamPriceOverview' as never)
      .mockResolvedValue({ success: false });

    const result = await service.getPricesWithMeta(['10 Year Birthday Coin'], {
      forceRefresh: true,
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result['10 Year Birthday Coin']?.priceMinor).toBeNull();
    expect(prisma.steamPriceCache.upsert).not.toHaveBeenCalled();
  });

  it('retries Steam fetch after a rate-limit error', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service, prisma } = createService();
    const requestMock = jest
      .spyOn(service as never, 'requestSteamPriceOverview' as never)
      .mockRejectedValueOnce(new SteamRateLimitError())
      .mockResolvedValueOnce({
        success: true,
        lowest_price: '$12.34',
      });

    const result = await service.getPricesWithMeta(
      ['AK-47 | Redline (Field-Tested)'],
      { forceRefresh: true },
    );

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
    jest
      .spyOn(service as never, 'lookupFallbackPriceMinor' as never)
      .mockResolvedValue(null);

    const result = await service.getPricesWithMeta([
      'AK-47 | Redline (Field-Tested)',
    ]);

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

    const result = await service.getPricesWithMeta(
      ['AK-47 | Redline (Field-Tested)'],
      {
        cacheOnly: true,
      },
    );

    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(4140);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('uses fallback snapshot prices when Steam is blocked', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'true';
    const { service, prisma } = createService();
    (
      service as unknown as { steamBlockedUntil: number }
    ).steamBlockedUntil = Date.now() + 60_000;
    (
      service as unknown as {
        fallbackSnapshot: {
          prices: Map<string, number>;
          fetchedAt: number;
          expiresAt: number;
        };
      }
    ).fallbackSnapshot = {
      prices: new Map([['AK-47 | Redline (Field-Tested)', 4140]]),
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };

    const requestMock = jest.spyOn(
      service as never,
      'requestSteamPriceOverview' as never,
    );

    const result = await service.getPricesWithMeta(
      ['AK-47 | Redline (Field-Tested)'],
      { forceRefresh: true },
    );

    expect(requestMock).not.toHaveBeenCalled();
    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(4140);
    expect(prisma.steamPriceCache.upsert).toHaveBeenCalled();
  });
});
