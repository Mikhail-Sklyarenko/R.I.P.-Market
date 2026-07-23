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
    assert.equal(snipers.weapon?.includes('G3SG1'), true);
    assert.equal(snipers.weapon?.includes('SCAR-20'), true);
    const rifles = resolveCatalogFilter('rifles', '');
    assert.equal(rifles.weapon?.includes('AK-47'), true);
    assert.equal(rifles.weapon?.includes('M4A4'), true);
    assert.equal(rifles.weapon?.includes('SG 553'), true);
    const pistols = resolveCatalogFilter('pistols', '');
    assert.equal(pistols.weapon?.includes('Glock-18'), true);
    assert.equal(pistols.weapon?.includes('Tec-9'), true);
    assert.equal(pistols.weapon?.includes('R8 Revolver'), true);
    const smg = resolveCatalogFilter('smg', '');
    assert.equal(smg.weapon?.includes('MP5-SD'), true);
    assert.equal(smg.weapon?.includes('P90'), true);
    const shotguns = resolveCatalogFilter('shotguns', '');
    assert.equal(shotguns.weapon?.includes('MAG-7'), true);
    assert.equal(shotguns.weapon?.includes('Sawed-Off'), true);
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

  it('resolves other subcategory filters by exact weapon, not name substrings', () => {
    assert.deepEqual(resolveCatalogFilter('other', 'other-charm'), {
      weapon: 'Charm',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-graffiti'), {
      weapon: 'Graffiti',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-agent'), {
      weapon: 'Agent',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-case'), {
      weapon: 'Case',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-key'), {
      weapon: 'Key',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-patch'), {
      weapon: 'Patch|Patch Capsule',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-sticker'), {
      weapon: 'Sticker|Sticker Slab',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-capsule'), {
      weapon: 'Sticker Capsule|Patch Capsule|Autograph Capsule',
    });
    assert.deepEqual(resolveCatalogFilter('other', 'other-pin'), {
      weapon: 'Collectible',
      q: 'Pin',
    });

    const allOther = resolveCatalogFilter('other', '');
    assert.equal(allOther.q, undefined);
    assert.equal(allOther.weapon?.includes('Charm'), true);
    assert.equal(allOther.weapon?.includes('Case'), true);
    assert.equal(allOther.weapon?.includes('Key'), true);
    assert.equal(allOther.weapon?.includes('Agent'), true);
  });

  it('maps other category values and weapon labels to the other tab', () => {
    assert.equal(findTabForWeapon('other-sticker'), 'other');
    assert.equal(findTabForWeapon('other-charm'), 'other');
    assert.equal(findTabForWeapon('Charm'), 'other');
    assert.equal(findTabForWeapon('Graffiti'), 'other');
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
