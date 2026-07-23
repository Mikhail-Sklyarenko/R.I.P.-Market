import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG_WEAR_FILTERS, getWearDisplayLabel } from './wear-filters.ts';

describe('wear-filters utils', () => {
  it('maps wear codes to Russian display labels by default', () => {
    assert.equal(getWearDisplayLabel('FN'), 'Прямо с завода');
    assert.equal(getWearDisplayLabel('MW'), 'Немного поношенное');
    assert.equal(getWearDisplayLabel('FT'), 'После полевых испытаний');
    assert.equal(getWearDisplayLabel('WW'), 'Поношённое');
    assert.equal(getWearDisplayLabel('BS'), 'Закалённое в боях');
  });

  it('maps wear codes to Steam English labels', () => {
    assert.equal(getWearDisplayLabel('FN', 'en'), 'Factory New');
    assert.equal(getWearDisplayLabel('FT', 'en'), 'Field-Tested');
    assert.equal(getWearDisplayLabel('BS', 'en'), 'Battle-Scarred');
  });

  it('exposes wear filter values without embedded locale labels', () => {
    assert.equal(CATALOG_WEAR_FILTERS[0]?.value, 'FN');
    assert.equal(CATALOG_WEAR_FILTERS[4]?.value, 'BS');
  });
});
