import { ReferencePriceService } from './reference-price.service';

describe('ReferencePriceService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null prices when disabled', async () => {
    process.env.REFERENCE_PRICE_ENABLED = 'false';
    const service = new ReferencePriceService();

    const prices = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)']);

    expect(prices['AK-47 | Redline (Field-Tested)']).toEqual({
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      fetchedAt: null,
    });
  });

  it('maps CSFloat and Buff responses to minor units', async () => {
    process.env.REFERENCE_PRICE_ENABLED = 'true';
    process.env.BUFF_REFERENCE_PRICE_ENABLED = 'true';
    process.env.CSFLOAT_REFERENCE_PRICE_ENABLED = 'true';

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('csfloat.com')) {
        return {
          ok: true,
          json: async () => ({ data: [{ price: 1250 }] }),
        } as Response;
      }
      if (url.includes('csgotrader.app')) {
        return {
          ok: true,
          json: async () => ({
            items: {
              'AK-47 | Redline (Field-Tested)': {
                buff: { starting_at: { price: 12.34 } },
              },
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const service = new ReferencePriceService();
    const prices = await service.getPricesWithMeta(['AK-47 | Redline (Field-Tested)']);

    expect(prices['AK-47 | Redline (Field-Tested)']).toEqual(
      expect.objectContaining({
        buffPriceMinor: 1234,
        csfloatPriceMinor: 1250,
        fetchedAt: expect.any(String),
      }),
    );
  });
});
