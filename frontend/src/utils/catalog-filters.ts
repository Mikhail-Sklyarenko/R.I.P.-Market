import {
  hasActiveSkinTraitFilters,
  type SkinTraitCheckboxState,
} from './catalog-skin-trait-filters.ts';

export type WeaponCategoryIconId =
  | 'all'
  | 'knife'
  | 'pistol'
  | 'rifle'
  | 'sniper'
  | 'smg'
  | 'shotgun'
  | 'gloves'
  | 'other';

export type CatalogCategoryFilter = {
  weapon?: string;
  rarity?: string;
  q?: string;
};

export type WeaponCategoryTab = {
  id: string;
  label: string;
  icon: WeaponCategoryIconId;
  filter: CatalogCategoryFilter;
};

export type CatalogCategoryOption = {
  value: string;
  label: string;
  tabId: string;
  icon?: WeaponCategoryIconId;
  modelIcon?: string;
  weapon?: string;
  rarity?: string;
  q?: string;
};

/**
 * Exact ItemDefinition.weapon labels for the «Другое» tab.
 * Never use marketHashName substring search here — it false-matches
 * Dispatch→Patch, Calligraffiti→Graffiti, Monkey Business→Key, etc.
 */
export const OTHER_CATEGORY_WEAPONS = {
  sticker: ['Sticker', 'Sticker Slab'],
  charm: ['Charm'],
  patch: ['Patch', 'Patch Capsule'],
  graffiti: ['Graffiti'],
  agent: ['Agent'],
  musicKit: ['Music Kit', 'Music Kit Box'],
  case: ['Case'],
  capsule: ['Sticker Capsule', 'Patch Capsule', 'Autograph Capsule'],
  key: ['Key'],
  collectible: ['Collectible'],
  /** Pins are Collectibles whose Steam name ends with " Pin". */
  pin: ['Collectible'],
  tool: ['Tool'],
  crate: ['Crate'],
  souvenir: ['Souvenir'],
} as const;

export const OTHER_CATALOG_WEAPON_NAMES = [
  ...new Set(Object.values(OTHER_CATEGORY_WEAPONS).flat()),
] as const;

/** @deprecated Prefer OTHER_CATALOG_WEAPON_NAMES — kept for older tests/docs. */
export const OTHER_CATALOG_SEARCH_TERMS = [
  'Sticker',
  'Charm',
  'Patch',
  'Graffiti',
  'Agent',
  'Music Kit',
  ' Case',
  'Capsule',
  'Package',
  'Collectible',
  'Pin',
  'Key',
  'Name Tag',
  'Storage Unit',
] as const;

/** @deprecated Prefer weapon OR from OTHER_CATALOG_WEAPON_NAMES. */
export const OTHER_CATALOG_ALL_Q = OTHER_CATALOG_SEARCH_TERMS.join('|');

function otherWeaponFilter(
  weapons: readonly string[],
): CatalogCategoryFilter {
  return { weapon: [...weapons].join('|') };
}

/** Exact ItemDefinition.weapon labels for glove cards (CSGO-API). */
export const GLOVE_WEAPON_NAMES = [
  'Bloodhound Gloves',
  'Broken Fang Gloves',
  'Driver Gloves',
  'Hand Wraps',
  'Hydra Gloves',
  'Moto Gloves',
  'Specialist Gloves',
  'Sport Gloves',
] as const;

/** Exact ItemDefinition.weapon labels for knife cards (CSGO-API). */
export const KNIFE_WEAPON_NAMES = [
  'Bayonet',
  'Bowie Knife',
  'Butterfly Knife',
  'Classic Knife',
  'Falchion Knife',
  'Flip Knife',
  'Gut Knife',
  'Huntsman Knife',
  'Karambit',
  'Kukri Knife',
  'M9 Bayonet',
  'Navaja Knife',
  'Nomad Knife',
  'Paracord Knife',
  'Shadow Daggers',
  'Skeleton Knife',
  'Stiletto Knife',
  'Survival Knife',
  'Talon Knife',
  'Ursus Knife',
] as const;

export const CATALOG_PAGE_LIMIT = 24;

function slugifyWeaponLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function weaponOptionsForTab(
  tabId: string,
  icon: WeaponCategoryIconId,
  weapons: readonly string[],
): CatalogCategoryOption[] {
  return weapons.map((weapon) => ({
    value: weapon,
    label: weapon,
    weapon,
    tabId,
    icon,
    modelIcon: slugifyWeaponLabel(weapon),
  }));
}

export const WEAPON_CATEGORY_TABS: readonly WeaponCategoryTab[] = [
  { id: 'all', label: 'Все', icon: 'all', filter: {} },
  {
    id: 'knives',
    label: 'Ножи',
    icon: 'knife',
    filter: { weapon: KNIFE_WEAPON_NAMES.join('|') },
  },
  { id: 'pistols', label: 'Пистолеты', icon: 'pistol', filter: {} },
  { id: 'rifles', label: 'Винтовки', icon: 'rifle', filter: {} },
  { id: 'snipers', label: 'Снайперские', icon: 'sniper', filter: {} },
  { id: 'smg', label: 'ПП', icon: 'smg', filter: {} },
  { id: 'shotguns', label: 'Дробовики', icon: 'shotgun', filter: {} },
  {
    id: 'gloves',
    label: 'Перчатки',
    icon: 'gloves',
    filter: { weapon: GLOVE_WEAPON_NAMES.join('|') },
  },
  {
    id: 'other',
    label: 'Другое',
    icon: 'other',
    filter: { weapon: OTHER_CATALOG_WEAPON_NAMES.join('|') },
  },
];

export const CATALOG_CATEGORY_OPTIONS: readonly CatalogCategoryOption[] = [
  { value: '', label: 'Все категории', tabId: 'all', icon: 'all' },
  // Pistols — full CS2 set (sorted like Steam / competitors)
  {
    value: 'CZ75-Auto',
    label: 'CZ75-Auto',
    weapon: 'CZ75-Auto',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'cz75-auto',
  },
  {
    value: 'Desert Eagle',
    label: 'Desert Eagle',
    weapon: 'Desert Eagle',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'desert-eagle',
  },
  {
    value: 'Dual Berettas',
    label: 'Dual Berettas',
    weapon: 'Dual Berettas',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'dual-berettas',
  },
  {
    value: 'Five-SeveN',
    label: 'Five-SeveN',
    weapon: 'Five-SeveN',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'five-seven',
  },
  {
    value: 'Glock-18',
    label: 'Glock-18',
    weapon: 'Glock-18',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'glock-18',
  },
  {
    value: 'P2000',
    label: 'P2000',
    weapon: 'P2000',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'p2000',
  },
  {
    value: 'P250',
    label: 'P250',
    weapon: 'P250',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'p250',
  },
  {
    value: 'R8 Revolver',
    label: 'R8 Revolver',
    weapon: 'R8 Revolver',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'r8-revolver',
  },
  {
    value: 'Tec-9',
    label: 'Tec-9',
    weapon: 'Tec-9',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'tec-9',
  },
  {
    value: 'USP-S',
    label: 'USP-S',
    weapon: 'USP-S',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'usp-s',
  },
  // Rifles
  {
    value: 'AK-47',
    label: 'AK-47',
    weapon: 'AK-47',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'ak-47',
  },
  {
    value: 'AUG',
    label: 'AUG',
    weapon: 'AUG',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'aug',
  },
  {
    value: 'FAMAS',
    label: 'FAMAS',
    weapon: 'FAMAS',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'famas',
  },
  {
    value: 'Galil AR',
    label: 'Galil AR',
    weapon: 'Galil AR',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'galil-ar',
  },
  {
    value: 'M4A1-S',
    label: 'M4A1-S',
    weapon: 'M4A1-S',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'm4a1-s',
  },
  {
    value: 'M4A4',
    label: 'M4A4',
    weapon: 'M4A4',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'm4a4',
  },
  {
    value: 'SG 553',
    label: 'SG 553',
    weapon: 'SG 553',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'sg-553',
  },
  // Snipers
  {
    value: 'AWP',
    label: 'AWP',
    weapon: 'AWP',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'awp',
  },
  {
    value: 'G3SG1',
    label: 'G3SG1',
    weapon: 'G3SG1',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'g3sg1',
  },
  {
    value: 'SCAR-20',
    label: 'SCAR-20',
    weapon: 'SCAR-20',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'scar-20',
  },
  {
    value: 'SSG 08',
    label: 'SSG 08',
    weapon: 'SSG 08',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'ssg-08',
  },
  // SMGs
  {
    value: 'MAC-10',
    label: 'MAC-10',
    weapon: 'MAC-10',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'mac-10',
  },
  {
    value: 'MP5-SD',
    label: 'MP5-SD',
    weapon: 'MP5-SD',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'mp5-sd',
  },
  {
    value: 'MP7',
    label: 'MP7',
    weapon: 'MP7',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'mp7',
  },
  {
    value: 'MP9',
    label: 'MP9',
    weapon: 'MP9',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'mp9',
  },
  {
    value: 'P90',
    label: 'P90',
    weapon: 'P90',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'p90',
  },
  {
    value: 'PP-Bizon',
    label: 'PP-Bizon',
    weapon: 'PP-Bizon',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'pp-bizon',
  },
  {
    value: 'UMP-45',
    label: 'UMP-45',
    weapon: 'UMP-45',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'ump-45',
  },
  // Shotguns
  {
    value: 'MAG-7',
    label: 'MAG-7',
    weapon: 'MAG-7',
    tabId: 'shotguns',
    icon: 'shotgun',
    modelIcon: 'mag-7',
  },
  {
    value: 'Nova',
    label: 'Nova',
    weapon: 'Nova',
    tabId: 'shotguns',
    icon: 'shotgun',
    modelIcon: 'nova',
  },
  {
    value: 'Sawed-Off',
    label: 'Sawed-Off',
    weapon: 'Sawed-Off',
    tabId: 'shotguns',
    icon: 'shotgun',
    modelIcon: 'sawed-off',
  },
  {
    value: 'XM1014',
    label: 'XM1014',
    weapon: 'XM1014',
    tabId: 'shotguns',
    icon: 'shotgun',
    modelIcon: 'xm1014',
  },
  ...weaponOptionsForTab('knives', 'knife', KNIFE_WEAPON_NAMES),
  ...weaponOptionsForTab('gloves', 'gloves', GLOVE_WEAPON_NAMES),
  {
    value: 'other-sticker',
    label: 'Наклейки',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-sticker',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.sticker),
  },
  {
    value: 'other-charm',
    label: 'Брелки',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-charm',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.charm),
  },
  {
    value: 'other-patch',
    label: 'Нашивки',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-patch',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.patch),
  },
  {
    value: 'other-graffiti',
    label: 'Графити',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-graffiti',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.graffiti),
  },
  {
    value: 'other-agent',
    label: 'Агенты',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-agent',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.agent),
  },
  {
    value: 'other-music-kit',
    label: 'Музыкальные наборы',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-music-kit',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.musicKit),
  },
  {
    value: 'other-case',
    label: 'Кейсы',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-case',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.case),
  },
  {
    value: 'other-capsule',
    label: 'Капсулы',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-capsule',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.capsule),
  },
  {
    value: 'other-key',
    label: 'Ключи',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-key',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.key),
  },
  {
    value: 'other-collectible',
    label: 'Коллекционные',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-collectible',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.collectible),
  },
  {
    value: 'other-pin',
    label: 'Значки',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-pin',
    // Collectible + "Pin" in name — safe with weapon gate (not P2000 | Dispatch).
    weapon: OTHER_CATEGORY_WEAPONS.pin.join('|'),
    q: 'Pin',
  },
  {
    value: 'other-souvenir',
    label: 'Сувениры',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-souvenir',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.souvenir),
  },
  {
    value: 'other-tool',
    label: 'Инструменты',
    tabId: 'other',
    icon: 'other',
    modelIcon: 'other-tool',
    ...otherWeaponFilter(OTHER_CATEGORY_WEAPONS.tool),
  },
];

export function getCategoryOptionsForTab(tabId: string): CatalogCategoryOption[] {
  return CATALOG_CATEGORY_OPTIONS.filter(
    (option) => option.tabId === tabId && option.value,
  );
}

export function findCategoryOption(value: string): CatalogCategoryOption | undefined {
  return (
    CATALOG_CATEGORY_OPTIONS.find((option) => option.value === value) ??
    CATALOG_CATEGORY_OPTIONS.find((option) => option.weapon === value)
  );
}

export function findTabForWeapon(weapon: string): string {
  const option = findCategoryOption(weapon);
  if (option) {
    return option.tabId;
  }
  const byWeapon = CATALOG_CATEGORY_OPTIONS.find((entry) => {
    if (!entry.weapon) {
      return false;
    }
    return entry.weapon.split('|').some((part) => part.trim() === weapon);
  });
  return byWeapon?.tabId ?? 'all';
}

/**
 * Resolve API filter for the category bar.
 * Specific dropdown option wins; otherwise "Все: …" uses every weapon in that tab
 * (exact weapon match — never fragile marketHashName substrings for categories).
 */
export function resolveCatalogFilter(
  activeTabId: string,
  categoryValue: string,
): CatalogCategoryFilter {
  if (categoryValue) {
    const option = findCategoryOption(categoryValue);
    if (option) {
      return {
        ...(option.q ? { q: option.q } : {}),
        ...(option.weapon ? { weapon: option.weapon } : {}),
        ...(option.rarity ? { rarity: option.rarity } : {}),
      };
    }
  }

  const tab = WEAPON_CATEGORY_TABS.find((entry) => entry.id === activeTabId);
  if (tab?.filter && (tab.filter.weapon || tab.filter.q || tab.filter.rarity)) {
    return { ...tab.filter };
  }

  const tabOptions = getCategoryOptionsForTab(activeTabId);
  const weapons = [
    ...new Set(
      tabOptions
        .flatMap((option) => (option.weapon ? option.weapon.split('|') : []))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (weapons.length > 0) {
    return { weapon: weapons.join('|') };
  }

  return tab?.filter ?? {};
}

export function hasActiveCatalogFilters(input: {
  search: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
  activeTabId: string;
  categoryValue: string;
  wearFilter?: string;
  floatMin?: string;
  floatMax?: string;
  skinTraitFilters?: SkinTraitCheckboxState;
}): boolean {
  return Boolean(
    input.search.trim() ||
      input.minPrice.trim() ||
      input.maxPrice.trim() ||
      input.sort !== 'newest' ||
      input.activeTabId !== 'all' ||
      input.categoryValue ||
      input.wearFilter ||
      input.floatMin?.trim() ||
      input.floatMax?.trim() ||
      (input.skinTraitFilters
        ? hasActiveSkinTraitFilters(input.skinTraitFilters)
        : false),
  );
}
