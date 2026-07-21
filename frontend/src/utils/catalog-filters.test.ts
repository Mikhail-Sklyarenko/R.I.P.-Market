import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCategoryOptionsForTab,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  WEAPON_CATEGORY_TABS,
  findTabForWeapon,
  CATALOG_PAGE_LIMIT,
  GLOVE_WEAPON_NAMES,
  KNIFE_WEAPON_NAMES,
} from './catalog-filters.ts';

describe('catalog-filters utils', () => {
  it('uses dropdown weapon over tab filter', () => {
    assert.deepEqual(resolveCatalogFilter('snipers', 'AK-47'), { weapon: 'AK-47' });
  });

  it('falls back to all tab weapons when dropdown is empty', () => {
    const snipers = resolveCatalogFilter('snipers', '');
    assert.equal(snipers.weapon?.includes('AWP'), true);
    assert.equal(snipers.weapon?.includes('SSG 08'), true);
    const rifles = resolveCatalogFilter('rifles', '');
    assert.equal(rifles.weapon?.includes('AK-47'), true);
    assert.equal(rifles.weapon?.includes('M4A4'), true);
  });

  it('filters gloves by weapon types, never by Extraordinary rarity', () => {
    const allGloves = resolveCatalogFilter('gloves', '');
    assert.equal(allGloves.rarity, undefined);
    assert.equal(allGloves.q, undefined);
    for (const weapon of GLOVE_WEAPON_NAMES) {
      assert.equal(allGloves.weapon?.includes(weapon), true, weapon);
    }
    assert.deepEqual(resolveCatalogFilter('gloves', 'Sport Gloves'), {
      weapon: 'Sport Gloves',
    });
    assert.deepEqual(resolveCatalogFilter('gloves', 'Hand Wraps'), {
      weapon: 'Hand Wraps',
    });
  });

  it('filters knives by weapon types, not fragile q=Knife text search', () => {
    const allKnives = resolveCatalogFilter('knives', '');
    assert.equal(allKnives.q, undefined);
    for (const weapon of KNIFE_WEAPON_NAMES) {
      assert.equal(allKnives.weapon?.includes(weapon), true, weapon);
    }
    assert.deepEqual(resolveCatalogFilter('knives', 'Karambit'), {
      weapon: 'Karambit',
    });
  });

  it('returns model options for a weapon tab', () => {
    const rifleOptions = getCategoryOptionsForTab('rifles');
    assert.ok(rifleOptions.some((option) => option.value === 'AK-47'));
    assert.ok(rifleOptions.every((option) => option.tabId === 'rifles'));
  });

  it('returns glove and knife subtype options', () => {
    assert.ok(getCategoryOptionsForTab('gloves').length >= GLOVE_WEAPON_NAMES.length);
    assert.ok(getCategoryOptionsForTab('knives').length >= KNIFE_WEAPON_NAMES.length);
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
    assert.equal(findTabForWeapon('Sport Gloves'), 'gloves');
    assert.equal(findTabForWeapon('Karambit'), 'knives');
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
    assert.equal(
      hasActiveCatalogFilters({
        search: '',
        sort: 'newest',
        minPrice: '',
        maxPrice: '',
        activeTabId: 'all',
        categoryValue: '',
        skinTraitFilters: {
          includeStatTrak: true,
          excludeStatTrak: false,
          includeSouvenir: false,
          excludeSouvenir: false,
        },
      }),
      true,
    );
  });
});
