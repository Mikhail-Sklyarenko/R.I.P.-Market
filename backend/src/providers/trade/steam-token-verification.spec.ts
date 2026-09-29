import {
  requestCredential,
  withSteamRequestCredential,
} from './steam-request-credential';
import {
  SteamTradeProvider,
  SteamTradeRateLimitError,
} from './steam-trade.provider';
import { steamTokenRead } from './steam-token-read';
jest.mock('./steam-token-read', () => ({ steamTokenRead: jest.fn() }));
const read = jest.mocked(steamTokenRead);
const context = {
  sellerSteamId: '76561198195181115',
  buyerSteamId: '76561198655632881',
  assetId: '50586848789',
};
const item = {
  appid: 730,
  contextid: '2',
  assetid: context.assetId,
  amount: '1',
};
const offer = {
  tradeofferid: '9394782030',
  tradeid: '744938690018816549',
  trade_offer_state: 3,
  is_our_offer: true,
  accountid_other: 695367153,
  items_to_give: [item],
  items_to_receive: [],
};
const receipt = {
  tradeid: offer.tradeid,
  status: 3,
  steamid_other: context.buyerSteamId,
  assets_given: [{ ...item, new_contextid: '2', new_assetid: '53954582039' }],
  assets_received: [],
};
const verify = () =>
  withSteamRequestCredential(
    offer.tradeofferid,
    context,
    'synthetic-token',
    () =>
      new SteamTradeProvider().verifyTradeOffer(offer.tradeofferid, context),
  );
function replies(changedOffer = offer, changedReceipt: unknown = receipt) {
  read
    .mockResolvedValueOnce({
      status: 200,
      data: { response: { steamid: context.sellerSteamId } },
    })
    .mockResolvedValueOnce({
      status: 200,
      data: { response: { offer: changedOffer } },
    })
    .mockResolvedValueOnce({
      status: 200,
      data: { response: { trades: [changedReceipt] } },
    });
}
beforeEach(() => read.mockReset());
it('requires Steam-authenticated token owner before reading offer', async () => {
  read.mockResolvedValueOnce({
    status: 200,
    data: { response: { steamid: context.buyerSteamId } },
  });
  expect(await verify()).toMatchObject({
    status: 'unknown',
    reasonCode: 'STEAM_TOKEN_OWNER_UNVERIFIED',
  });
  expect(read).toHaveBeenCalledTimes(1);
});
it('accepts only complete exact receipt mapping', async () => {
  replies();
  expect(await verify()).toMatchObject({
    status: 'accepted',
    receivedAssetId: '53954582039',
  });
  expect(read.mock.calls.map((c) => c[0])).toEqual([
    'GetTokenDetails',
    'GetTradeOffer',
    'GetTradeStatus',
  ]);
});
it.each([
  {},
  { ...receipt, assets_given: [item] },
  {
    ...receipt,
    assets_given: [
      { ...item, new_contextid: '16', new_assetid: '53954582039' },
    ],
  },
  {
    ...receipt,
    assets_given: [{ ...receipt.assets_given[0], rollback_new_assetid: '123' }],
  },
])('fails closed on missing/protected/rollback mapping', async (value) => {
  replies(offer, value);
  expect(await verify()).toMatchObject({
    status: 'unknown',
    reasonCode: 'STEAM_RECEIPT_MAPPING_UNAVAILABLE',
  });
});
it('rejects wrong offer before receipt query', async () => {
  replies({ ...offer, tradeofferid: '123' });
  expect(await verify()).toMatchObject({ status: 'unknown' });
  expect(read).toHaveBeenCalledTimes(2);
});
it('preserves rate limiting', async () => {
  read.mockResolvedValueOnce({ status: 429, data: null });
  await expect(verify()).rejects.toBeInstanceOf(SteamTradeRateLimitError);
});
it('isolates concurrent requests and binds all context fields', async () => {
  await Promise.all(
    ['one', 'two'].map((token) =>
      withSteamRequestCredential('offer', context, token, async () => {
        await Promise.resolve();
        expect(requestCredential('offer', context)).toBe(token);
        expect(requestCredential('other', context)).toBeUndefined();
        for (const field of ['assetId', 'buyerSteamId', 'sellerSteamId'])
          expect(
            requestCredential('offer', { ...context, [field]: 'other' }),
          ).toBeUndefined();
      }),
    ),
  );
  expect(requestCredential('offer', context)).toBeUndefined();
});
it('clears credential from inherited asynchronous work on failure', async () => {
  let delayed: Promise<void>;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await expect(
    withSteamRequestCredential('offer', context, 'token', async () => {
      delayed = gate.then(() => {
        expect(requestCredential('offer', context)).toBeUndefined();
      });
      throw new Error('failure');
    }),
  ).rejects.toThrow('failure');
  release();
  await delayed!;
});
