import { SteamProfileService } from './steam-profile.service';

describe('SteamProfileService', () => {
  const originalApiKey = process.env.STEAM_WEB_API_KEY;

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  it('returns null when STEAM_WEB_API_KEY is not set', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    await expect(service.fetchPersonaName('76561198000000000')).resolves.toBeNull();
  });

  it('returns persona name from GetPlayerSummaries', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          players: [{ personaname: 'TestPlayer' }],
        },
      }),
    } as Response);

    await expect(service.fetchPersonaName('76561198000000000')).resolves.toBe(
      'TestPlayer',
    );
  });

  it('returns null when Steam API responds with non-OK status', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);

    await expect(service.fetchPersonaName('76561198000000000')).resolves.toBeNull();
  });
});
