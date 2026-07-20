import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_SKIN_TRAIT_FILTERS,
  hasActiveSkinTraitFilters,
  resolveSkinTraitApiFilter,
  skinTraitFiltersToQuery,
} from './catalog-skin-trait-filters.ts';

describe('catalog-skin-trait-filters utils', () => {
  it('maps include-only checkbox pairs to API only filter', () => {
    assert.equal(resolveSkinTraitApiFilter(true, false), 'only');
    assert.equal(resolveSkinTraitApiFilter(false, true), 'exclude');
    assert.equal(resolveSkinTraitApiFilter(true, true), undefined);
    assert.equal(resolveSkinTraitApiFilter(false, false), undefined);
  });

  it('builds stattrak and souvenir query params', () => {
    assert.deepEqual(
      skinTraitFiltersToQuery({
        ...EMPTY_SKIN_TRAIT_FILTERS,
        includeStatTrak: true,
        excludeSouvenir: true,
      }),
      { stattrak: 'only', souvenir: 'exclude' },
    );
  });

  it('detects active skin trait filters', () => {
    assert.equal(hasActiveSkinTraitFilters(EMPTY_SKIN_TRAIT_FILTERS), false);
    assert.equal(
      hasActiveSkinTraitFilters({
        ...EMPTY_SKIN_TRAIT_FILTERS,
        includeSouvenir: true,
      }),
      true,
    );
  });
});
