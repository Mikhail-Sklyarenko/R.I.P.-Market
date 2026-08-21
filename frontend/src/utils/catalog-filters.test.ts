import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CASE_MARKET_HASH_NAMES,
  decodeCategorySelection,
  encodeCategorySelection,
  getCategoryOptionsForTab,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  WEAPON_CATEGORY_TABS,
  findTabForWeapon,
  isTabLevelWeaponFilter,
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
    const pistolOrder = getCategoryOptionsForTab('pistols').map((o) => o.value);
    assert.deepEqual(pistolOrder.slice(0, 2), ['Glock-18', 'USP-S']);
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

  it('filters cases by weapon Case and exact marketHashName per case', () => {
    const allCases = resolveCatalogFilter('cases', '');
    assert.deepEqual(allCases, { weapon: 'Case|Terminal' });
    assert.equal(allCases.q, undefined);
    assert.equal(allCases.marketHashName, undefined);
    assert.ok(CASE_MARKET_HASH_NAMES.length >= 40);
    assert.deepEqual(resolveCatalogFilter('cases', 'Revolution Case'), {
      weapon: 'Case',
      marketHashName: 'Revolution Case',
    });
    assert.deepEqual(resolveCatalogFilter('cases', 'CS:GO Weapon Case'), {
      weapon: 'Case',
      marketHashName: 'CS:GO Weapon Case',
    });
    assert.deepEqual(resolveCatalogFilter('cases', 'Sealed Genesis Terminal'), {
      weapon: 'Terminal',
      marketHashName: 'Sealed Genesis Terminal',
    });
    assert.deepEqual(resolveCatalogFilter('cases', 'Sealed Dead Hand Terminal'), {
      weapon: 'Terminal',
      marketHashName: 'Sealed Dead Hand Terminal',
    });
    assert.deepEqual(
      resolveCatalogFilter('cases', ['Revolution Case', 'Gallery Case']),
      {
        weapon: 'Case',
        marketHashName: 'Revolution Case|Gallery Case',
      },
    );
    assert.deepEqual(resolveCatalogFilter('snipers', ['AWP', 'SSG 08']), {
      weapon: 'AWP|SSG 08',
    });
    const caseOptions = getCategoryOptionsForTab('cases');
    assert.ok(caseOptions.length >= CASE_MARKET_HASH_NAMES.length + 2);
    assert.equal(caseOptions[0]?.value, 'Sealed Dead Hand Terminal');
    assert.equal(caseOptions[1]?.value, 'Sealed Genesis Terminal');
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

  it('returns other-tab subcategories without burying cases there', () => {
    const otherOptions = getCategoryOptionsForTab('other');
    assert.ok(otherOptions.some((option) => option.value === 'other-sticker'));
    assert.ok(otherOptions.some((option) => option.value === 'other-charm'));
    assert.equal(
      otherOptions.some((option) => option.value === 'other-case'),
      false,
    );
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
    assert.equal(allOther.weapon?.includes('Case'), false);
    assert.equal(allOther.weapon?.includes('Key'), true);
    assert.equal(allOther.weapon?.includes('Agent'), true);
  });

  it('maps case and other category values to the correct tabs', () => {
    assert.equal(findTabForWeapon('other-sticker'), 'other');
    assert.equal(findTabForWeapon('other-charm'), 'other');
    assert.equal(findTabForWeapon('Charm'), 'other');
    assert.equal(findTabForWeapon('Graffiti'), 'other');
    assert.equal(findTabForWeapon('Sport Gloves'), 'gloves');
    assert.equal(findTabForWeapon('Karambit'), 'knives');
    assert.equal(findTabForWeapon('Case'), 'cases');
    assert.equal(findTabForWeapon('Terminal'), 'cases');
    assert.equal(findTabForWeapon('Case|Terminal'), 'cases');
    assert.equal(findTabForWeapon('Revolution Case'), 'cases');
    assert.equal(findTabForWeapon('Sealed Genesis Terminal'), 'cases');
    assert.equal(isTabLevelWeaponFilter('Case'), true);
    assert.equal(isTabLevelWeaponFilter('Terminal'), true);
    assert.equal(isTabLevelWeaponFilter('Case|Terminal'), true);
    assert.equal(isTabLevelWeaponFilter('Revolution Case'), false);
  });

  it('encodes and decodes multi category selections for URL sync', () => {
    assert.equal(
      encodeCategorySelection('snipers', 'subset', ['AWP', 'SSG 08']),
      'AWP|SSG 08',
    );
    assert.deepEqual(decodeCategorySelection('AWP|SSG 08'), {
      tabId: 'snipers',
      mode: 'subset',
      values: ['AWP', 'SSG 08'],
    });
    assert.deepEqual(decodeCategorySelection('Case|Terminal'), {
      tabId: 'cases',
      mode: 'all',
      values: [],
    });
    assert.deepEqual(decodeCategorySelection('Revolution Case'), {
      tabId: 'cases',
      mode: 'subset',
      values: ['Revolution Case'],
    });
    assert.equal(encodeCategorySelection('cases', 'all', []), 'Case|Terminal');
    assert.equal(
      encodeCategorySelection('snipers', 'empty', []),
      '__empty__:snipers',
    );
    // Legacy empty URLs recover to whole-tab browse, not a blank catalog.
    assert.deepEqual(decodeCategorySelection('__empty__:snipers'), {
      tabId: 'snipers',
      mode: 'all',
      values: [],
    });
    assert.deepEqual(resolveCatalogFilter('snipers', [], 'empty'), {
      marketHashName: '__no_such_catalog_item__',
    });
    assert.equal(
      resolveCatalogFilter('snipers', [], 'all').weapon?.includes('AWP'),
      true,
    );
  });

  it('uses a fixed default catalog page size', () => {
    assert.equal(CATALOG_PAGE_LIMIT, 96);
  });

  it('places cases after all and other last in the category bar', () => {
    const tabIds = WEAPON_CATEGORY_TABS.map((tab) => tab.id);
    assert.equal(tabIds[0], 'all');
    assert.equal(tabIds[1], 'cases');
    assert.equal(tabIds[tabIds.length - 1], 'other');
  });

  it('detects active filters', () => {
    assert.equal(
      hasActiveCatalogFilters({
        search: '',
        sort: 'newest',
        minPrice: '',
        maxPrice: '',
        activeTabId: 'all',
        categoryValues: [],
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
        categoryValues: [],
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
        categoryValues: [],
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
