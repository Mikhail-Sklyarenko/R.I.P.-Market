import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSteamProfileUrl,
  canLinkSteamProfile,
  formatCounterpartyDisplayName,
} from './steam-profile.ts';

describe('steam-profile', () => {
  it('builds Steam community profile URL', () => {
    assert.equal(
      buildSteamProfileUrl('76561198000000000'),
      'https://steamcommunity.com/profiles/76561198000000000',
    );
  });

  it('prefers persona name over username', () => {
    assert.equal(
      formatCounterpartyDisplayName({
        username: 'seller1',
        steamPersonaName: 'Pro Trader',
      }),
      'Pro Trader',
    );
  });

  it('allows profile links only for real SteamID64', () => {
    assert.equal(canLinkSteamProfile('76561198000000000'), true);
    assert.equal(canLinkSteamProfile('steam_mock_seller'), false);
    assert.equal(canLinkSteamProfile(null), false);
  });
});
