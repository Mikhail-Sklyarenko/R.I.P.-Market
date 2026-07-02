import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidSteamTradeUrl } from './trade-url.ts';

describe('trade-url utils', () => {
  it('accepts valid Steam trade URL', () => {
    assert.equal(
      isValidSteamTradeUrl(
        'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh',
      ),
      true,
    );
  });

  it('rejects invalid URLs', () => {
    assert.equal(isValidSteamTradeUrl('not-a-url'), false);
    assert.equal(isValidSteamTradeUrl('https://example.com/tradeoffer/new/?partner=1&token=x'), false);
    assert.equal(
      isValidSteamTradeUrl('https://steamcommunity.com/tradeoffer/8309876543/'),
      false,
    );
  });
});
