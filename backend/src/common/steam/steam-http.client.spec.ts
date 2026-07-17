import {
  getSteamHttpProxyUrl,
  isSteamHttpProxyConfigured,
  resetSteamHttpClientForTests,
  shouldUseSteamProxy,
  STEAM_HTTP_PROXY_ENV,
} from './steam-http.client';

describe('steam-http.client', () => {
  const originalProxy = process.env[STEAM_HTTP_PROXY_ENV];
  const originalAll = process.env.STEAM_HTTP_PROXY_ALL;

  afterEach(() => {
    resetSteamHttpClientForTests();
    if (originalProxy === undefined) {
      delete process.env[STEAM_HTTP_PROXY_ENV];
    } else {
      process.env[STEAM_HTTP_PROXY_ENV] = originalProxy;
    }
    if (originalAll === undefined) {
      delete process.env.STEAM_HTTP_PROXY_ALL;
    } else {
      process.env.STEAM_HTTP_PROXY_ALL = originalAll;
    }
  });

  it('reports proxy as not configured when env is empty', () => {
    delete process.env[STEAM_HTTP_PROXY_ENV];
    resetSteamHttpClientForTests();
    expect(isSteamHttpProxyConfigured()).toBe(false);
    expect(getSteamHttpProxyUrl()).toBeNull();
  });

  it('uses proxy for steamcommunity but not Web API by default', () => {
    process.env[STEAM_HTTP_PROXY_ENV] =
      'http://user:secret@gw.dataimpulse.com:823';
    delete process.env.STEAM_HTTP_PROXY_ALL;
    resetSteamHttpClientForTests();
    expect(
      shouldUseSteamProxy('https://steamcommunity.com/openid/login'),
    ).toBe(true);
    expect(
      shouldUseSteamProxy(
        'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
      ),
    ).toBe(false);
  });

  it('can force proxy for all Steam hosts', () => {
    process.env[STEAM_HTTP_PROXY_ENV] =
      'http://user:secret@gw.dataimpulse.com:823';
    process.env.STEAM_HTTP_PROXY_ALL = 'true';
    resetSteamHttpClientForTests();
    expect(
      shouldUseSteamProxy(
        'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
      ),
    ).toBe(true);
  });
});
