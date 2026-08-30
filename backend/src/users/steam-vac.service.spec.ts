import { Test, TestingModule } from '@nestjs/testing';
import { SteamVacService } from './steam-vac.service';
import * as steamHttp from '../common/steam/steam-http.client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

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

  it('fails closed with UNAVAILABLE when ban check is required without API key', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    process.env.VAC_CHECK_REQUIRED = 'true';
    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toMatchObject({
      code: ErrorCode.STEAM_BAN_CHECK_UNAVAILABLE,
    });
  });

  it('throws STEAM_VAC_BANNED when Steam reports a VAC ban', async () => {
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
    ).rejects.toMatchObject({ code: ErrorCode.STEAM_VAC_BANNED });
  });

  it('throws STEAM_GAME_BANNED when Steam reports game bans without VAC', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    steamFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        players: [
          {
            SteamId: '76561198000000000',
            VACBanned: false,
            NumberOfGameBans: 1,
          },
        ],
      }),
    } as Response);

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toMatchObject({ code: ErrorCode.STEAM_GAME_BANNED });
  });

  it('fails with STEAM_BAN_CHECK_UNAVAILABLE on Steam API errors when required', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    process.env.VAC_CHECK_REQUIRED = 'true';
    steamFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    try {
      await service.assertCanTrade({ steamId: '76561198000000000' });
      fail('expected AppException');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(
        ErrorCode.STEAM_BAN_CHECK_UNAVAILABLE,
      );
      expect((error as AppException).message).toMatch(/ban status/i);
    }
  });

  it('does not cache unavailable failures as bans', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    process.env.VAC_CHECK_REQUIRED = 'true';
    steamFetch
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            {
              SteamId: '76561198000000000',
              VACBanned: false,
              NumberOfGameBans: 0,
            },
          ],
        }),
      } as Response);

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toMatchObject({
      code: ErrorCode.STEAM_BAN_CHECK_UNAVAILABLE,
    });

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).resolves.toBeUndefined();
  });
});
