import { parseSteamTradeOfferId } from './trade-offer.util';

describe('trade-offer.util', () => {
  it('parses numeric offer id', () => {
    expect(parseSteamTradeOfferId('8301234567')).toBe('8301234567');
  });

  it('parses offer id from Steam trade URL', () => {
    expect(
      parseSteamTradeOfferId(
        'https://steamcommunity.com/tradeoffer/8301234567/',
      ),
    ).toBe('8301234567');
  });
});
