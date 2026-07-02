import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasActiveCatalogFilters,
  resolveCatalogFilter,
} from './catalog-filters.ts';

describe('catalog-filters utils', () => {
  it('uses dropdown weapon over tab filter', () => {
    assert.deepEqual(resolveCatalogFilter('snipers', 'AK-47'), { weapon: 'AK-47' });
  });

  it('falls back to tab filter when dropdown is empty', () => {
    assert.deepEqual(resolveCatalogFilter('snipers', ''), { weapon: 'AWP' });
    assert.deepEqual(resolveCatalogFilter('rifles', ''), { weapon: 'AK-47' });
  });

  it('detects active filters', () => {
    assert.equal(
      hasActiveCatalogFilters({
        search: '',
        sort: 'newest',
        minPrice: '',
        maxPrice: '',
        activeTabId: 'all',
        categoryValue: '',
      }),
      false,
    );
    assert.equal(
      hasActiveCatalogFilters({
        search: 'ak',
        sort: 'newest',
        minPrice: '',
        maxPrice: '',
        activeTabId: 'all',
        categoryValue: '',
      }),
      true,
    );
  });
});
