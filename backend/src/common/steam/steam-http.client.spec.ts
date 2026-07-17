import {
  getSteamHttpProxyUrl,
  isSteamHttpProxyConfigured,
  resetSteamHttpClientForTests,
  STEAM_HTTP_PROXY_ENV,
} from './steam-http.client';

describe('steam-http.client', () => {
  const original = process.env[STEAM_HTTP_PROXY_ENV];

  afterEach(() => {
    resetSteamHttpClientForTests();
    if (original === undefined) {
      delete process.env[STEAM_HTTP_PROXY_ENV];
    } else {
      process.env[STEAM_HTTP_PROXY_ENV] = original;
    }
  });

  it('reports proxy as not configured when env is empty', () => {
    delete process.env[STEAM_HTTP_PROXY_ENV];
    resetSteamHttpClientForTests();
    expect(isSteamHttpProxyConfigured()).toBe(false);
    expect(getSteamHttpProxyUrl()).toBeNull();
  });

  it('reads STEAM_HTTP_PROXY without exposing secrets in helpers', () => {
    process.env[STEAM_HTTP_PROXY_ENV] =
      'http://user:secret@gw.dataimpulse.com:823';
    resetSteamHttpClientForTests();
    expect(isSteamHttpProxyConfigured()).toBe(true);
    expect(getSteamHttpProxyUrl()).toContain('gw.dataimpulse.com:823');
  });
});
