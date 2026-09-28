import {
  SteamTradeProvider,
  SteamTradeRateLimitError,
} from './steam-trade.provider';
import { steamFetch } from '../../common/steam/steam-http.client';

jest.mock('../../common/steam/steam-http.client', () => ({
  steamFetch: jest.fn(),
}));

describe('SteamTradeProvider evidence', () => {
  const fetchMock = jest.mocked(steamFetch);
  const originalKey = process.env.STEAM_WEB_API_KEY;
  const offerId = '9391832342';
  const provider = new SteamTradeProvider();

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.STEAM_WEB_API_KEY = 'test-only-key';
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = originalKey;
  });

  function respond(offer?: Record<string, unknown>) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: { offer } }),
    } as Response);
  }

  it('does not treat HTTP 200 without an offer as delivery evidence', async () => {
    respond();
    expect((await provider.verifyTradeOffer(offerId)).status).toBe('unknown');
  });

  it.each([undefined, '123', 9391832342])(
    'rejects an accepted offer with response ID %s',
    async (id) => {
      respond({ tradeofferid: id, trade_offer_state: 3 });
      expect((await provider.verifyTradeOffer(offerId)).status).toBe('unknown');
    },
  );

  it.each([
    [2, 'pending'],
    [9, 'needs_confirmation'],
    [11, 'pending'],
    [3, 'unknown'],
    [7, 'declined'],
    [6, 'expired'],
    [99, 'unknown'],
  ])('maps state %s only for the requested offer', async (state, expected) => {
    respond({ tradeofferid: offerId, trade_offer_state: state });
    expect((await provider.verifyTradeOffer(offerId)).status).toBe(expected);
  });

  it('preserves rate limits for the delivery backoff', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(provider.verifyTradeOffer(offerId)).rejects.toBeInstanceOf(
      SteamTradeRateLimitError,
    );
  });

  it('makes no request for invalid IDs or an absent key', async () => {
    expect((await provider.verifyTradeOffer('invalid')).status).toBe('unknown');
    delete process.env.STEAM_WEB_API_KEY;
    expect((await provider.verifyTradeOffer(offerId)).status).toBe('unknown');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Steam order-bound receipt verification', () => {
  const originalOwner = process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID;
  const originalKey = process.env.STEAM_WEB_API_KEY;
  const fetchMock = jest.mocked(steamFetch);
  const provider = new SteamTradeProvider();
  const context = {
    sellerSteamId: '76561198195181115',
    buyerSteamId: '76561198655632881',
    assetId: '50586823960',
  };
  const item = {
    appid: 730,
    contextid: '2',
    assetid: context.assetId,
    amount: '1',
  };
  const offer = {
    tradeofferid: '9391832342',
    tradeid: '744938690018752002',
    trade_offer_state: 3,
    is_our_offer: true,
    accountid_other: 695367153,
    items_to_give: [item],
    items_to_receive: [],
  };
  const receipt = {
    tradeid: offer.tradeid,
    steamid_other: context.buyerSteamId,
    status: 3,
    assets_given: [{ ...item, new_assetid: '53954582039', new_contextid: '2' }],
    assets_received: [],
  };
  const response = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.STEAM_WEB_API_KEY = 'test-key';
    process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID = context.sellerSteamId;
  });
  afterEach(() => {
    if (originalOwner === undefined)
      delete process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID;
    else process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID = originalOwner;
    if (originalKey === undefined) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = originalKey;
  });
  it('gets the receipt ID from Steam, then returns its validated destination asset', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ response: { offer } }))
      .mockResolvedValueOnce(response({ response: { trades: [receipt] } }));
    expect(
      await provider.verifyTradeOffer(offer.tradeofferid, context),
    ).toEqual({
      status: 'accepted',
      tradable: null,
      tradeLockUntil: null,
      receivedAssetId: '53954582039',
    });
    const requested = new URL(String(fetchMock.mock.calls[1][0]));
    expect(requested.pathname).toBe('/IEconService/GetTradeStatus/v1/');
    expect(requested.searchParams.get('tradeid')).toBe(offer.tradeid);
    expect(fetchMock.mock.calls[1][1]).toEqual({ redirect: 'error' });
  });
  it('does not look up a receipt when the credential owner is unknown', async () => {
    delete process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID;
    fetchMock.mockResolvedValueOnce(response({ response: { offer } }));
    expect(
      (await provider.verifyTradeOffer(offer.tradeofferid, context)).status,
    ).toBe('unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('reads a receipt for accepted missing items but does not invent its destination mapping', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          response: {
            offer: {
              ...offer,
              items_to_give: [{ ...item, missing: true }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          response: {
            trades: [
              {
                ...receipt,
                assets_given: [item],
              },
            ],
          },
        }),
      );
    expect(
      await provider.verifyTradeOffer(offer.tradeofferid, context),
    ).toEqual({
      status: 'unknown',
      tradable: null,
      tradeLockUntil: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('accepts a historical missing item only with an independently valid receipt mapping', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          response: {
            offer: {
              ...offer,
              items_to_give: [{ ...item, missing: true }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({ response: { trades: [receipt] } }));
    expect(
      await provider.verifyTradeOffer(offer.tradeofferid, context),
    ).toEqual({
      status: 'accepted',
      tradable: null,
      tradeLockUntil: null,
      receivedAssetId: '53954582039',
    });
  });
  it.each([
    null,
    {},
    { response: { trades: [] } },
    { response: { trades: [{ ...receipt, status: 6 }] } },
    { response: { trades: [receipt, receipt] } },
  ])('does not accept an unusable receipt %j', async (body) => {
    fetchMock
      .mockResolvedValueOnce(response({ response: { offer } }))
      .mockResolvedValueOnce(response(body));
    expect(
      (await provider.verifyTradeOffer(offer.tradeofferid, context)).status,
    ).toBe('unknown');
  });
  it('propagates receipt rate limits for retry backoff', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ response: { offer } }))
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    await expect(
      provider.verifyTradeOffer(offer.tradeofferid, context),
    ).rejects.toBeInstanceOf(SteamTradeRateLimitError);
  });
});
