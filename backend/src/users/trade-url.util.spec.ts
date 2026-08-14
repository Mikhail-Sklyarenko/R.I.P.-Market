import {
  buildSteamTradeUrlForSteamId64,
  hasValidTradeUrl,
  isValidSteamTradeUrl,
  parseTradeUrlPartnerAccountId,
  tradeUrlMatchesSteamId64,
} from './trade-url.util';

describe('trade-url util', () => {
  const validUrl =
    'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';

  it('accepts valid Steam trade URLs', () => {
    expect(isValidSteamTradeUrl(validUrl)).toBe(true);
    expect(hasValidTradeUrl(validUrl)).toBe(true);
  });

  it('extracts partner account id', () => {
    expect(parseTradeUrlPartnerAccountId(validUrl)).toBe('123456789');
    expect(parseTradeUrlPartnerAccountId('https://example.com')).toBeNull();
  });

  it('matches trade URL partner to linked SteamID64', () => {
    const steamId = '76561198000000000';
    const matchingUrl = buildSteamTradeUrlForSteamId64(steamId, 'AbCdEfGh')!;
    expect(tradeUrlMatchesSteamId64(matchingUrl, steamId)).toBe(true);
    expect(tradeUrlMatchesSteamId64(validUrl, steamId)).toBe(false);
    expect(tradeUrlMatchesSteamId64(validUrl, 'steam_mock_buyer')).toBe(true);
    expect(tradeUrlMatchesSteamId64(validUrl, null)).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(hasValidTradeUrl(null)).toBe(false);
    expect(hasValidTradeUrl('')).toBe(false);
    expect(isValidSteamTradeUrl('https://example.com')).toBe(false);
    expect(
      isValidSteamTradeUrl('https://steamcommunity.com/tradeoffer/123/'),
    ).toBe(false);
  });
});
