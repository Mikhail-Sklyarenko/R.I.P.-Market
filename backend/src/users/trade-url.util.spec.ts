import {
  hasValidTradeUrl,
  isValidSteamTradeUrl,
} from './trade-url.util';

describe('trade-url util', () => {
  it('accepts valid Steam trade URLs', () => {
    const url =
      'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';
    expect(isValidSteamTradeUrl(url)).toBe(true);
    expect(hasValidTradeUrl(url)).toBe(true);
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
