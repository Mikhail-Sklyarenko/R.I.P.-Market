import { SteamMarketPriceService } from './steam-market-price.service';

describe('SteamMarketPriceService', () => {
  const originalEnabled = process.env.STEAM_MARKET_PRICE_ENABLED;

  afterEach(() => {
    process.env.STEAM_MARKET_PRICE_ENABLED = originalEnabled;
    jest.restoreAllMocks();
  });

  it('returns deterministic mock prices when Steam market pricing is disabled', async () => {
    process.env.STEAM_MARKET_PRICE_ENABLED = 'false';
    const service = new SteamMarketPriceService();

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
    const service = new SteamMarketPriceService();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          lowest_price: '$12.34',
        }),
      } as Response);

    const result = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)'], {
      forceRefresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result['AK-47 | Redline (Field-Tested)']?.priceMinor).toBe(1234);
  });
});
