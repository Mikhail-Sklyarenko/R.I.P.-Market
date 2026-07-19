import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCategoryOptionsForTab,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  WEAPON_CATEGORY_TABS,
  findTabForWeapon,
  CATALOG_PAGE_LIMIT,
} from './catalog-filters.ts';

describe('catalog-filters utils', () => {
  it('uses dropdown weapon over tab filter', () => {
    assert.deepEqual(resolveCatalogFilter('snipers', 'AK-47'), { weapon: 'AK-47' });
  });

  it('falls back to tab filter when dropdown is empty', () => {
    assert.deepEqual(resolveCatalogFilter('snipers', ''), { weapon: 'AWP' });
    assert.deepEqual(resolveCatalogFilter('rifles', ''), { weapon: 'AK-47' });
  });

  it('returns model options for a weapon tab', () => {
    const rifleOptions = getCategoryOptionsForTab('rifles');
    assert.ok(rifleOptions.some((option) => option.value === 'AK-47'));
    assert.ok(rifleOptions.every((option) => option.tabId === 'rifles'));
  });

  it('returns other-tab subcategories for stickers, charms, and more', () => {
    const otherOptions = getCategoryOptionsForTab('other');
    assert.ok(otherOptions.some((option) => option.value === 'other-sticker'));
    assert.ok(otherOptions.some((option) => option.value === 'other-charm'));
    assert.ok(otherOptions.some((option) => option.value === 'other-case'));
    assert.equal(otherOptions.find((option) => option.value === 'other-sticker')?.label, 'Наклейки');
  });

  it('resolves other subcategory filters by market hash query', () => {
    assert.deepEqual(resolveCatalogFilter('other', 'other-charm'), { q: 'Charm' });
    assert.deepEqual(resolveCatalogFilter('other', ''), {
      q: 'Sticker|Charm|Patch|Graffiti|Agent|Music Kit| Case|Capsule|Package|Collectible|Pin|Key|Name Tag|Storage Unit',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-capsule'), { q: 'Capsule' });
    assert.deepEqual(resolveCatalogFilter('other', 'other-key'), { q: 'Key' });
  });

  it('maps other category values to the other tab', () => {
    assert.equal(findTabForWeapon('other-sticker'), 'other');
    assert.equal(findTabForWeapon('other-charm'), 'other');
  });

  it('uses a fixed catalog page size', () => {
    assert.equal(CATALOG_PAGE_LIMIT, 24);
  });

  it('places other last and gloves before other in the category bar', () => {
    const tabIds = WEAPON_CATEGORY_TABS.map((tab) => tab.id);
    const glovesIndex = tabIds.indexOf('gloves');
    const otherIndex = tabIds.indexOf('other');
    assert.equal(otherIndex, tabIds.length - 1);
    assert.equal(glovesIndex, otherIndex - 1);
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
