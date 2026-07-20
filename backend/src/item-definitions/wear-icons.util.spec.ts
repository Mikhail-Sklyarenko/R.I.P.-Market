import { describe, expect, it } from '@jest/globals';
import {
  mergeWearIcons,
  parseWearIcons,
  resolveWearIconUrl,
} from './wear-icons.util';

describe('wear-icons util', () => {
  it('parses wear icon map from json', () => {
    expect(
      parseWearIcons({
        FN: '-9a81fn',
        FT: '-9a81ft',
        bogus: 'x',
        MW: 42,
      }),
    ).toEqual({
      FN: '-9a81fn',
      FT: '-9a81ft',
    });
  });

  it('resolves icon by wear with fallback', () => {
    const icons = { FN: '-9a81fn', FT: '-9a81ft' };
    expect(resolveWearIconUrl(icons, 'FT', '-9a81default')).toBe('-9a81ft');
    expect(resolveWearIconUrl(icons, 'MW', '-9a81default')).toBe('-9a81default');
    expect(resolveWearIconUrl({}, null, null)).toBeNull();
  });

  it('merges wear icon maps', () => {
    expect(
      mergeWearIcons({ FN: 'a' }, { FT: 'b', FN: 'c' }),
    ).toEqual({ FN: 'c', FT: 'b' });
  });
});
