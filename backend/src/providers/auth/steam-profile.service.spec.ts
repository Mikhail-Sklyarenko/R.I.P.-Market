import { SteamProfileService } from './steam-profile.service';

describe('SteamProfileService', () => {
  const originalApiKey = process.env.STEAM_WEB_API_KEY;

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  it('returns null when persona cannot be resolved', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);
    await expect(
      service.fetchPersonaName('76561198000000000'),
    ).resolves.toBeNull();
  });

  it('falls back to community XML when web API key is missing', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        '<profile><steamID64>76561198000000000</steamID64><steamID><![CDATA[TestPlayer]]></steamID></profile>',
    } as Response);

    await expect(service.fetchPersonaName('76561198000000000')).resolves.toBe(
      'TestPlayer',
    );
  });

  it('returns persona name from GetPlayerSummaries', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          players: [{ personaname: 'ApiPlayer' }],
        },
      }),
    } as Response);

    await expect(service.fetchPersonaName('76561198000000000')).resolves.toBe(
      'ApiPlayer',
    );
  });

  it('parses avatarfull from GetPlayerSummaries', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          players: [
            {
              personaname: 'ApiPlayer',
              avatarfull: 'https://avatars.steamstatic.com/test_full.jpg',
            },
          ],
        },
      }),
    } as Response);

    await expect(service.fetchPlayerSummary('76561198000000000')).resolves.toEqual({
      personaname: 'ApiPlayer',
      avatarUrl: 'https://avatars.steamstatic.com/test_full.jpg',
    });
  });

  it('returns null when Steam API responds with non-OK status', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);

    await expect(
      service.fetchPersonaName('76561198000000000'),
    ).resolves.toBeNull();
  });
});
