import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSteamItemImageUrl } from './item-image.ts';
import {
  parseWearIcons,
  preloadWearIcons,
  resolveWearIconUrl,
} from './wear-icons.ts';

describe('wear-icons utils', () => {
  it('parses wear icon map from json', () => {
    assert.deepEqual(
      parseWearIcons({
        FN: '-9a81fn',
        FT: '-9a81ft',
        bogus: 'x',
      }),
      {
        FN: '-9a81fn',
        FT: '-9a81ft',
      },
    );
  });

  it('resolves icon by wear with fallback', () => {
    const icons = { FN: '-9a81fn', FT: '-9a81ft' };
    assert.equal(resolveWearIconUrl(icons, 'FT', '-9a81default'), '-9a81ft');
    assert.equal(resolveWearIconUrl(icons, 'mw', '-9a81default'), '-9a81default');
    assert.equal(resolveWearIconUrl({}, null, null), null);
  });

  it('preloads wear icons without throwing', () => {
    preloadWearIcons(
      { FN: '-9a81fn' },
      (iconUrl) => getSteamItemImageUrl(iconUrl),
    );
  });
});
