import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSteamMarketListingUrl,
  resolveSteamMarketHashName,
} from './steam-market-link.ts';

describe('steam-market-link', () => {
  it('keeps Battle-Scarred in the Steam market URL', () => {
    const name = 'Dual Berettas | Polished Malachite (Battle-Scarred)';
    assert.equal(resolveSteamMarketHashName(name, 'BS'), name);
    assert.match(
      buildSteamMarketListingUrl(name, 'BS'),
      /Polished%20Malachite%20\(Battle-Scarred\)/,
    );
  });

  it('rewrites a mismatched Factory New suffix to Battle-Scarred', () => {
    assert.equal(
      resolveSteamMarketHashName(
        'Dual Berettas | Polished Malachite (Factory New)',
        'BS',
      ),
      'Dual Berettas | Polished Malachite (Battle-Scarred)',
    );
  });
});
