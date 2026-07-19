import { Test, TestingModule } from '@nestjs/testing';
import { SteamVacService } from './steam-vac.service';
import * as steamHttp from '../common/steam/steam-http.client';

jest.mock('../common/steam/steam-http.client', () => ({
  steamFetch: jest.fn(),
}));

describe('SteamVacService', () => {
  let service: SteamVacService;
  const originalApiKey = process.env.STEAM_WEB_API_KEY;
  const originalVacRequired = process.env.VAC_CHECK_REQUIRED;
  const originalAuth = process.env.AUTH_PROVIDER;
  const originalInventory = process.env.INVENTORY_PROVIDER;
  const steamFetch = steamHttp.steamFetch as jest.MockedFunction<
    typeof steamHttp.steamFetch
  >;

  beforeEach(async () => {
    process.env.VAC_CHECK_REQUIRED = 'false';
    process.env.AUTH_PROVIDER = 'mock';
    process.env.INVENTORY_PROVIDER = 'mock';
    steamFetch.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SteamVacService],
    }).compile();
    service = module.get(SteamVacService);
  });

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalApiKey;
    process.env.VAC_CHECK_REQUIRED = originalVacRequired;
    process.env.AUTH_PROVIDER = originalAuth;
    process.env.INVENTORY_PROVIDER = originalInventory;
  });

  it('skips VAC check when steamId is missing', async () => {
    await expect(
      service.assertCanTrade({ steamId: null }),
    ).resolves.toBeUndefined();
  });

  it('skips VAC check when STEAM_WEB_API_KEY is not configured and check is optional', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    process.env.VAC_CHECK_REQUIRED = 'false';
    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).resolves.toBeUndefined();
  });

  it('fails closed when VAC check is required without API key', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    process.env.VAC_CHECK_REQUIRED = 'true';
    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toThrow(/STEAM_WEB_API_KEY/);
  });

  it('throws when Steam reports a VAC ban', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    steamFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        players: [
          {
            SteamId: '76561198000000000',
            VACBanned: true,
            NumberOfGameBans: 0,
          },
        ],
      }),
    } as Response);

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toThrow('VAC ban');
  });

  it('fails closed on Steam API errors when check is required', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    process.env.VAC_CHECK_REQUIRED = 'true';
    steamFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toThrow(/Unable to verify VAC/);
  });
});
