import { Test, TestingModule } from '@nestjs/testing';
import { SteamVacService } from './steam-vac.service';

describe('SteamVacService', () => {
  let service: SteamVacService;
  const originalApiKey = process.env.STEAM_WEB_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SteamVacService],
    }).compile();
    service = module.get(SteamVacService);
  });

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it('skips VAC check when steamId is missing', async () => {
    await expect(
      service.assertCanTrade({ steamId: null }),
    ).resolves.toBeUndefined();
  });

  it('skips VAC check when STEAM_WEB_API_KEY is not configured', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).resolves.toBeUndefined();
  });

  it('throws when Steam reports a VAC ban', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
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
    }) as typeof fetch;

    await expect(
      service.assertCanTrade({ steamId: '76561198000000000' }),
    ).rejects.toThrow('VAC ban');
  });
});
