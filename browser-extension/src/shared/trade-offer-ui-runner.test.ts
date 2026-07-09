import { describe, expect, it } from 'vitest';
import { isTabOnBuyerTradeUrl, tradeOfferUrlKey } from './trade-offer-ui-runner.js';

describe('trade-offer-ui-runner', () => {
  it('matches trade offer urls by partner and token', () => {
    const url =
      'https://steamcommunity.com/tradeoffer/new/?partner=1805495901&token=yQDkvXQN';
    expect(tradeOfferUrlKey(url)).toBe('1805495901:yQDkvXQN');
    expect(isTabOnBuyerTradeUrl(url, url)).toBe(true);
  });

  it('returns false for different trade urls', () => {
    expect(
      isTabOnBuyerTradeUrl(
        'https://steamcommunity.com/tradeoffer/new/?partner=1&token=a',
        'https://steamcommunity.com/tradeoffer/new/?partner=2&token=b',
      ),
    ).toBe(false);
  });
});
