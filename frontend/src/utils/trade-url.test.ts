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

it('rejects unsupported protocols, ports, account ids and ambiguous parameters', () => {
  for (const url of ["http://steamcommunity.com/tradeoffer/new/?partner=1&token=a", "https://steamcommunity.com:444/tradeoffer/new/?partner=1&token=a", "https://steamcommunity.com/tradeoffer/new/?partner=4294967296&token=a", "https://steamcommunity.com/tradeoffer/new/?partner=1&partner=2&token=a", "https://steamcommunity.com/tradeoffer/new/?partner=1&token=a%26b"]) { assert.equal(isValidSteamTradeUrl(url), false); }
});
