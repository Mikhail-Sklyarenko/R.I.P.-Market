import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATALOG_CATEGORY_OPTIONS,
  getCategoryOptionsForTab,
} from './catalog-filters.ts';

function weaponCatalogOptions() {
  return CATALOG_CATEGORY_OPTIONS.filter(
    (option) => option.value && option.tabId !== 'other',
  );
}

describe('catalog model icons', () => {
  it('defines modelIcon slug for each weapon catalog option with value', () => {
    const options = weaponCatalogOptions();
    assert.ok(options.length >= 14);
    for (const option of options) {
      assert.ok(option.modelIcon, `missing modelIcon for ${option.value}`);
      assert.match(option.modelIcon, /^[a-z0-9-]+$/);
    }
  });

  it('keeps model icons unique per weapon option value', () => {
    const slugs = weaponCatalogOptions().map((option) => option.modelIcon);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('exposes dropdown options for weapon tabs', () => {
    assert.ok(getCategoryOptionsForTab('rifles').length >= 7);
    assert.ok(getCategoryOptionsForTab('snipers').length >= 4);
    assert.ok(getCategoryOptionsForTab('pistols').length >= 10);
    assert.ok(getCategoryOptionsForTab('smg').length >= 7);
    assert.ok(getCategoryOptionsForTab('shotguns').length >= 4);
  });
});
