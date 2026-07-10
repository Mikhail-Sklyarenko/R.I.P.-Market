import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATALOG_CATEGORY_OPTIONS,
  getCategoryOptionsForTab,
} from './catalog-filters.ts';

describe('catalog model icons', () => {
  it('defines modelIcon slug for each catalog option with value', () => {
    const options = CATALOG_CATEGORY_OPTIONS.filter((option) => option.value);
    assert.ok(options.length >= 14);
    for (const option of options) {
      assert.ok(option.modelIcon, `missing modelIcon for ${option.value}`);
      assert.match(option.modelIcon, /^[a-z0-9-]+$/);
    }
  });

  it('keeps model icons unique per option value', () => {
    const slugs = CATALOG_CATEGORY_OPTIONS.filter((option) => option.value).map(
      (option) => option.modelIcon,
    );
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('exposes dropdown options for weapon tabs', () => {
    assert.ok(getCategoryOptionsForTab('rifles').length >= 4);
    assert.ok(getCategoryOptionsForTab('snipers').length >= 2);
  });
});
