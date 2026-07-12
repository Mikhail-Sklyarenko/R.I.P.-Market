import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG_WEAR_FILTERS, getWearDisplayLabel } from './wear-filters.ts';

describe('wear-filters utils', () => {
  it('maps wear codes to Russian display labels', () => {
    assert.equal(getWearDisplayLabel('FN'), 'Прямо с завода');
    assert.equal(getWearDisplayLabel('MW'), 'Немного поношенное');
    assert.equal(getWearDisplayLabel('FT'), 'После полевых испытаний');
    assert.equal(getWearDisplayLabel('WW'), 'Поношённое');
    assert.equal(getWearDisplayLabel('BS'), 'Закалённое в боях');
  });

  it('exposes Russian labels in catalog wear filters', () => {
    assert.equal(CATALOG_WEAR_FILTERS[0]?.label, 'Прямо с завода');
    assert.equal(CATALOG_WEAR_FILTERS[4]?.label, 'Закалённое в боях');
  });
});
