import { Logger } from '@nestjs/common';
import { SteamTradeProvider } from './steam-trade.provider';
import { withSteamRequestCredential } from './steam-request-credential';
import { steamTokenRead } from './steam-token-read';
jest.mock('./steam-token-read', () => ({ steamTokenRead: jest.fn() }));
afterEach(() => jest.restoreAllMocks());
it('logs only fixed identity failure scalars, never credentials or upstream content', async () => {
  const secret = 'synthetic-test-secret-do-not-log';
  jest.mocked(steamTokenRead).mockResolvedValue({
    status: 403,
    data: { response: { steamid: secret, error: secret } },
  });
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  const context = {
    sellerSteamId: '76561198195181115',
    buyerSteamId: '76561198655632881',
    assetId: '50586848789',
  };
  await withSteamRequestCredential('9394782030', context, secret, () =>
    new SteamTradeProvider().verifyTradeOffer('9394782030', context),
  );
  expect(warn).toHaveBeenCalledTimes(1);
  const line = String(warn.mock.calls[0][0]);
  expect(line).not.toContain(secret);
  expect(JSON.parse(line)).toEqual({
    event: 'steam_token_identity_unverified',
    httpStatus: 403,
    ownerMatches: false,
  });
});
