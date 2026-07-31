import { SteamProfileService } from './steam-profile.service';
import * as steamHttp from '../../common/steam/steam-http.client';

// The service reaches Steam through steamFetch (proxy-aware), not global.fetch.
jest.mock('../../common/steam/steam-http.client', () => ({
  steamFetch: jest.fn(),
}));

describe('SteamProfileService', () => {
  const originalApiKey = process.env.STEAM_WEB_API_KEY;
  const steamFetch = steamHttp.steamFetch as jest.MockedFunction<
    typeof steamHttp.steamFetch
  >;

  beforeEach(() => {
    steamFetch.mockReset();
  });

  afterEach(() => {
    process.env.STEAM_WEB_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  it('returns null when persona cannot be resolved', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    steamFetch.mockResolvedValue({
      ok: false,
    } as Response);
    await expect(
      service.fetchPersonaName('76561198000000000'),
    ).resolves.toBeNull();
  });

  it('falls back to community XML when web API key is missing', async () => {
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    steamFetch.mockResolvedValue({
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
    steamFetch.mockResolvedValue({
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
    steamFetch.mockResolvedValue({
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

    await expect(
      service.fetchPlayerSummary('76561198000000000'),
    ).resolves.toEqual({
      personaname: 'ApiPlayer',
      avatarUrl: 'https://avatars.steamstatic.com/test_full.jpg',
    });
  });

  it('returns null when Steam API responds with non-OK status', async () => {
    process.env.STEAM_WEB_API_KEY = 'test-key';
    const service = new SteamProfileService();
    steamFetch.mockResolvedValue({
      ok: false,
    } as Response);

    await expect(
      service.fetchPersonaName('76561198000000000'),
    ).resolves.toBeNull();
  });

  it('does not reach the network when the mock is not configured', async () => {
    // Guards against the regression this file had: mocking the wrong module let
    // the suite make real Steam calls and pass for the wrong reason.
    delete process.env.STEAM_WEB_API_KEY;
    const service = new SteamProfileService();
    steamFetch.mockRejectedValue(new Error('network disabled in tests'));

    await expect(
      service.fetchPersonaName('76561198000000000'),
    ).resolves.toBeNull();
    expect(steamFetch).toHaveBeenCalled();
  });
});
