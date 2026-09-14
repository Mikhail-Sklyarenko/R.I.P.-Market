import { afterEach, expect, it, vi } from 'vitest';
import { sendTradeOfferViaPageScript } from './steam-trade-offer.js';
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'sessionid=; Max-Age=0; path=/';
});
it('sends the recipient SteamID64 while retaining the account ID in the trade URL', async () => {
  document.cookie = 'sessionid=test; path=/';
  const fetchMock = vi.fn(async () => ({
    status: 200,
    text: async () => JSON.stringify({ tradeofferid: '123456789' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    scripting: {
      executeScript: async ({ func, args }: any) => [
        { result: await func(...args) },
      ],
    },
  });
  const result = await sendTradeOfferViaPageScript(1, {
    buyerTradeUrl:
      'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
    item: { assetId: '42' },
  });
  expect(result).toMatchObject({ ok: true, offerId: '123456789' });
  const call = (
    fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
  )[0];
  const body = new URLSearchParams(call[1].body as string);
  expect(body.get('partner')).toBe('76561197960265851');
  expect(JSON.parse(body.get('json_tradeoffer')!).me.assets).toEqual([
    { appid: 730, contextid: '2', amount: 1, assetid: '42' },
  ]);
});
