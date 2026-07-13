import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
  parseWearCodeFromMarketHashName,
} from './catalog-lot-display.ts';

describe('catalog-lot-display utils', () => {
  it('splits weapon and skin from market hash name', () => {
    assert.deepEqual(parseCatalogLotName('SSG 08 | Calligrafaux (Field-Tested)'), {
      weapon: 'SSG 08',
      skin: 'Calligrafaux',
    });
  });

  it('returns wear badge color for known wear codes', () => {
    assert.deepEqual(getWearBadgeStyle('WW'), {
      label: 'WW',
      color: '#ffb454',
    });
  });

  it('parses wear code from market hash name suffix', () => {
    assert.equal(
      parseWearCodeFromMarketHashName('AK-47 | Redline (Field-Tested)'),
      'FT',
    );
    assert.equal(parseWearCodeFromMarketHashName('Revolution Case'), null);
  });
});
