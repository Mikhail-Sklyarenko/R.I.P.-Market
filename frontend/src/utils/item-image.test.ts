import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ITEM_IMAGE_PLACEHOLDER_DATA,
  getSteamItemImageUrl,
  resolveDisplayIconUrl,
} from './item-image.ts';

describe('item-image', () => {
  it('returns placeholder for empty icon urls', () => {
    assert.equal(getSteamItemImageUrl(null), ITEM_IMAGE_PLACEHOLDER_DATA);
    assert.equal(getSteamItemImageUrl(''), ITEM_IMAGE_PLACEHOLDER_DATA);
    assert.equal(getSteamItemImageUrl('   '), ITEM_IMAGE_PLACEHOLDER_DATA);
  });

  it('keeps absolute and data urls intact', () => {
    const https = 'https://cdn.example/icon.png';
    assert.equal(getSteamItemImageUrl(https), https);
    assert.equal(
      getSteamItemImageUrl(ITEM_IMAGE_PLACEHOLDER_DATA),
      ITEM_IMAGE_PLACEHOLDER_DATA,
    );
  });

  it('prefixes relative steam economy hashes', () => {
    assert.equal(
      getSteamItemImageUrl('abc123'),
      'https://community.cloudflare.steamstatic.com/economy/image/abc123',
    );
  });

  it('prefers primary icon when resolving display url', () => {
    assert.equal(resolveDisplayIconUrl('a', 'b'), 'a');
    assert.equal(resolveDisplayIconUrl(null, 'b'), 'b');
    assert.equal(resolveDisplayIconUrl('  ', null), null);
  });
});
