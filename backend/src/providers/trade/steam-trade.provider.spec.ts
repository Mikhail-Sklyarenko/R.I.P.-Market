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
    [3, 'accepted'],
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
