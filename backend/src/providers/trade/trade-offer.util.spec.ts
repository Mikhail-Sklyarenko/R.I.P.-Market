import {
  parseSteamTradeOfferId,
  isValidSteamOfferId,
} from './trade-offer.util';

describe('trade-offer.util', () => {
  it('parses numeric offer id', () => {
    expect(parseSteamTradeOfferId('8301234567')).toBe('8301234567');
  });

  it('parses offer id from Steam trade URL path', () => {
    expect(
      parseSteamTradeOfferId(
        'https://steamcommunity.com/tradeoffer/8301234567/',
      ),
    ).toBe('8301234567');
  });

  it('parses offer id from tradeofferid query param', () => {
    expect(
      parseSteamTradeOfferId(
        'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc&tradeofferid=8305551234',
      ),
    ).toBe('8305551234');
  });

  it('rejects too-short numeric ids', () => {
    expect(parseSteamTradeOfferId('12345')).toBeNull();
    expect(isValidSteamOfferId('12345')).toBe(false);
  });
});
