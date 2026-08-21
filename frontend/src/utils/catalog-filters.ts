import {
  hasActiveSkinTraitFilters,
  type SkinTraitCheckboxState,
} from './catalog-skin-trait-filters.ts';

export type WeaponCategoryIconId =
  | 'all'
  | 'cases'
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
  /** Exact market hash name (catalog API `marketHashName`). */
  marketHashName?: string;
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
  marketHashName?: string;
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


/** Exact ItemDefinition.marketHashName values for CS2 weapon cases (ByMykel crates type=Case). */
export const CASE_MARKET_HASH_NAMES = [
  "CS20 Case",
  "CS:GO Weapon Case",
  "CS:GO Weapon Case 2",
  "CS:GO Weapon Case 3",
  "Chroma 2 Case",
  "Chroma 3 Case",
  "Chroma Case",
  "Clutch Case",
  "Danger Zone Case",
  "Dreams & Nightmares Case",
  "Falchion Case",
  "Fever Case",
  "Fracture Case",
  "Gallery Case",
  "Gamma 2 Case",
  "Gamma Case",
  "Glove Case",
  "Horizon Case",
  "Huntsman Weapon Case",
  "Kilowatt Case",
  "Operation Bravo Case",
  "Operation Breakout Weapon Case",
  "Operation Broken Fang Case",
  "Operation Hydra Case",
  "Operation Phoenix Weapon Case",
  "Operation Riptide Case",
  "Operation Vanguard Weapon Case",
  "Operation Wildfire Case",
  "Prisma 2 Case",
  "Prisma Case",
  "Recoil Case",
  "Revolution Case",
  "Revolver Case",
  "Shadow Case",
  "Shattered Web Case",
  "Snakebite Case",
  "Spectrum 2 Case",
  "Spectrum Case",
  "Winter Offensive Weapon Case",
  "eSports 2013 Case",
  "eSports 2013 Winter Case",
  "eSports 2014 Summer Case",
] as const;

/** Armory terminals (ByMykel crates without type; market names end with Terminal). */
export const TERMINAL_MARKET_HASH_NAMES = [
  'Sealed Dead Hand Terminal',
  'Sealed Genesis Terminal',
] as const;

/** Cases tab includes classic cases + Armory terminals. */
export const CASES_TAB_WEAPON_FILTER = 'Case|Terminal';

export const CATALOG_PAGE_LIMIT = 96;

export const CATALOG_PAGE_SIZE_OPTIONS = [96] as const;

export type CatalogPageSize = (typeof CATALOG_PAGE_SIZE_OPTIONS)[number];

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
    id: 'cases',
    label: 'Кейсы',
    icon: 'cases',
    filter: { weapon: CASES_TAB_WEAPON_FILTER },
  },
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
  // Terminals first (newest Armory containers), then classic cases
  {
    value: 'Sealed Dead Hand Terminal',
    label: 'Sealed Dead Hand Terminal',
    weapon: 'Terminal',
    marketHashName: 'Sealed Dead Hand Terminal',
    tabId: 'cases',
    icon: 'cases',
    modelIcon: 'Sealed Dead Hand Terminal',
  },
  {
    value: 'Sealed Genesis Terminal',
    label: 'Sealed Genesis Terminal',
    weapon: 'Terminal',
    marketHashName: 'Sealed Genesis Terminal',
    tabId: 'cases',
    icon: 'cases',
    modelIcon: 'Sealed Genesis Terminal',
  },
  // Cases — full marketable CS2 set (exact marketHashName filter)
  {
    value: "CS20 Case",
    label: "CS20 Case",
    weapon: 'Case',
    marketHashName: "CS20 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "CS20 Case",
  },
  {
    value: "CS:GO Weapon Case",
    label: "CS:GO Weapon Case",
    weapon: 'Case',
    marketHashName: "CS:GO Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "CS:GO Weapon Case",
  },
  {
    value: "CS:GO Weapon Case 2",
    label: "CS:GO Weapon Case 2",
    weapon: 'Case',
    marketHashName: "CS:GO Weapon Case 2",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "CS:GO Weapon Case 2",
  },
  {
    value: "CS:GO Weapon Case 3",
    label: "CS:GO Weapon Case 3",
    weapon: 'Case',
    marketHashName: "CS:GO Weapon Case 3",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "CS:GO Weapon Case 3",
  },
  {
    value: "Chroma 2 Case",
    label: "Chroma 2 Case",
    weapon: 'Case',
    marketHashName: "Chroma 2 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Chroma 2 Case",
  },
  {
    value: "Chroma 3 Case",
    label: "Chroma 3 Case",
    weapon: 'Case',
    marketHashName: "Chroma 3 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Chroma 3 Case",
  },
  {
    value: "Chroma Case",
    label: "Chroma Case",
    weapon: 'Case',
    marketHashName: "Chroma Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Chroma Case",
  },
  {
    value: "Clutch Case",
    label: "Clutch Case",
    weapon: 'Case',
    marketHashName: "Clutch Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Clutch Case",
  },
  {
    value: "Danger Zone Case",
    label: "Danger Zone Case",
    weapon: 'Case',
    marketHashName: "Danger Zone Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Danger Zone Case",
  },
  {
    value: "Dreams & Nightmares Case",
    label: "Dreams & Nightmares Case",
    weapon: 'Case',
    marketHashName: "Dreams & Nightmares Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Dreams & Nightmares Case",
  },
  {
    value: "Falchion Case",
    label: "Falchion Case",
    weapon: 'Case',
    marketHashName: "Falchion Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Falchion Case",
  },
  {
    value: "Fever Case",
    label: "Fever Case",
    weapon: 'Case',
    marketHashName: "Fever Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Fever Case",
  },
  {
    value: "Fracture Case",
    label: "Fracture Case",
    weapon: 'Case',
    marketHashName: "Fracture Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Fracture Case",
  },
  {
    value: "Gallery Case",
    label: "Gallery Case",
    weapon: 'Case',
    marketHashName: "Gallery Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Gallery Case",
  },
  {
    value: "Gamma 2 Case",
    label: "Gamma 2 Case",
    weapon: 'Case',
    marketHashName: "Gamma 2 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Gamma 2 Case",
  },
  {
    value: "Gamma Case",
    label: "Gamma Case",
    weapon: 'Case',
    marketHashName: "Gamma Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Gamma Case",
  },
  {
    value: "Glove Case",
    label: "Glove Case",
    weapon: 'Case',
    marketHashName: "Glove Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Glove Case",
  },
  {
    value: "Horizon Case",
    label: "Horizon Case",
    weapon: 'Case',
    marketHashName: "Horizon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Horizon Case",
  },
  {
    value: "Huntsman Weapon Case",
    label: "Huntsman Weapon Case",
    weapon: 'Case',
    marketHashName: "Huntsman Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Huntsman Weapon Case",
  },
  {
    value: "Kilowatt Case",
    label: "Kilowatt Case",
    weapon: 'Case',
    marketHashName: "Kilowatt Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Kilowatt Case",
  },
  {
    value: "Operation Bravo Case",
    label: "Operation Bravo Case",
    weapon: 'Case',
    marketHashName: "Operation Bravo Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Bravo Case",
  },
  {
    value: "Operation Breakout Weapon Case",
    label: "Operation Breakout Weapon Case",
    weapon: 'Case',
    marketHashName: "Operation Breakout Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Breakout Weapon Case",
  },
  {
    value: "Operation Broken Fang Case",
    label: "Operation Broken Fang Case",
    weapon: 'Case',
    marketHashName: "Operation Broken Fang Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Broken Fang Case",
  },
  {
    value: "Operation Hydra Case",
    label: "Operation Hydra Case",
    weapon: 'Case',
    marketHashName: "Operation Hydra Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Hydra Case",
  },
  {
    value: "Operation Phoenix Weapon Case",
    label: "Operation Phoenix Weapon Case",
    weapon: 'Case',
    marketHashName: "Operation Phoenix Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Phoenix Weapon Case",
  },
  {
    value: "Operation Riptide Case",
    label: "Operation Riptide Case",
    weapon: 'Case',
    marketHashName: "Operation Riptide Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Riptide Case",
  },
  {
    value: "Operation Vanguard Weapon Case",
    label: "Operation Vanguard Weapon Case",
    weapon: 'Case',
    marketHashName: "Operation Vanguard Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Vanguard Weapon Case",
  },
  {
    value: "Operation Wildfire Case",
    label: "Operation Wildfire Case",
    weapon: 'Case',
    marketHashName: "Operation Wildfire Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Operation Wildfire Case",
  },
  {
    value: "Prisma 2 Case",
    label: "Prisma 2 Case",
    weapon: 'Case',
    marketHashName: "Prisma 2 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Prisma 2 Case",
  },
  {
    value: "Prisma Case",
    label: "Prisma Case",
    weapon: 'Case',
    marketHashName: "Prisma Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Prisma Case",
  },
  {
    value: "Recoil Case",
    label: "Recoil Case",
    weapon: 'Case',
    marketHashName: "Recoil Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Recoil Case",
  },
  {
    value: "Revolution Case",
    label: "Revolution Case",
    weapon: 'Case',
    marketHashName: "Revolution Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Revolution Case",
  },
  {
    value: "Revolver Case",
    label: "Revolver Case",
    weapon: 'Case',
    marketHashName: "Revolver Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Revolver Case",
  },
  {
    value: "Shadow Case",
    label: "Shadow Case",
    weapon: 'Case',
    marketHashName: "Shadow Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Shadow Case",
  },
  {
    value: "Shattered Web Case",
    label: "Shattered Web Case",
    weapon: 'Case',
    marketHashName: "Shattered Web Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Shattered Web Case",
  },
  {
    value: "Snakebite Case",
    label: "Snakebite Case",
    weapon: 'Case',
    marketHashName: "Snakebite Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Snakebite Case",
  },
  {
    value: "Spectrum 2 Case",
    label: "Spectrum 2 Case",
    weapon: 'Case',
    marketHashName: "Spectrum 2 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Spectrum 2 Case",
  },
  {
    value: "Spectrum Case",
    label: "Spectrum Case",
    weapon: 'Case',
    marketHashName: "Spectrum Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Spectrum Case",
  },
  {
    value: "Winter Offensive Weapon Case",
    label: "Winter Offensive Weapon Case",
    weapon: 'Case',
    marketHashName: "Winter Offensive Weapon Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "Winter Offensive Weapon Case",
  },
  {
    value: "eSports 2013 Case",
    label: "eSports 2013 Case",
    weapon: 'Case',
    marketHashName: "eSports 2013 Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "eSports 2013 Case",
  },
  {
    value: "eSports 2013 Winter Case",
    label: "eSports 2013 Winter Case",
    weapon: 'Case',
    marketHashName: "eSports 2013 Winter Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "eSports 2013 Winter Case",
  },
  {
    value: "eSports 2014 Summer Case",
    label: "eSports 2014 Summer Case",
    weapon: 'Case',
    marketHashName: "eSports 2014 Summer Case",
    tabId: 'cases',
    icon: 'cases',
    modelIcon: "eSports 2014 Summer Case",
  },
  // Pistols — most-played starters first, then the rest alphabetically.
  {
    value: 'Glock-18',
    label: 'Glock-18',
    weapon: 'Glock-18',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'glock-18',
  },
  {
    value: 'USP-S',
    label: 'USP-S',
    weapon: 'USP-S',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'usp-s',
  },
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
  const tabByFilter = WEAPON_CATEGORY_TABS.find((tab) => {
    if (!tab.filter.weapon) {
      return false;
    }
    if (tab.filter.weapon === weapon) {
      return true;
    }
    return tab.filter.weapon
      .split('|')
      .map((part) => part.trim())
      .includes(weapon);
  });
  if (tabByFilter) {
    return tabByFilter.id;
  }

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
 * True when `weapon` is a whole-tab filter (e.g. Case, Case|Terminal),
 * not a single model option value.
 */
export function isTabLevelWeaponFilter(weapon: string): boolean {
  return WEAPON_CATEGORY_TABS.some((tab) => {
    if (!tab.filter.weapon) {
      return false;
    }
    if (tab.filter.weapon === weapon) {
      return true;
    }
    // Compact multi-type tabs (Case|Terminal). Skip long knife/glove OR lists.
    const parts = tab.filter.weapon
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length >= 2 && parts.length <= 4 && parts.includes(weapon);
  });
}

/**
 * Category dropdown selection:
 * - all: every model in the active tab ("Выбрать все")
 * - subset: only checked option values
 * - empty: reserved / legacy URL only (UI no longer creates blank catalogs)
 */
export type CategorySelectionMode = 'all' | 'subset' | 'empty';

/** Matches nothing — legacy empty mode only (UI prefers all / leave tab). */
export const EMPTY_CATEGORY_MATCH_FILTER: CatalogCategoryFilter = {
  marketHashName: '__no_such_catalog_item__',
};

const EMPTY_CATEGORY_URL_PREFIX = '__empty__:';

export function normalizeCategoryValues(
  categoryValue: string | readonly string[],
): string[] {
  if (typeof categoryValue === 'string') {
    const trimmed = categoryValue.trim();
    return trimmed ? [trimmed] : [];
  }
  return [...new Set(categoryValue.map((value) => value.trim()).filter(Boolean))];
}

function filterFromOption(option: CatalogCategoryOption): CatalogCategoryFilter {
  return {
    ...(option.q ? { q: option.q } : {}),
    ...(option.weapon ? { weapon: option.weapon } : {}),
    ...(option.rarity ? { rarity: option.rarity } : {}),
    ...(option.marketHashName ? { marketHashName: option.marketHashName } : {}),
  };
}

function resolveSubsetFilter(values: readonly string[]): CatalogCategoryFilter {
  if (values.length === 1) {
    const option = findCategoryOption(values[0]!);
    if (option) {
      return filterFromOption(option);
    }
  }

  if (values.length > 1) {
    const options = values
      .map((value) => findCategoryOption(value))
      .filter((option): option is CatalogCategoryOption => Boolean(option));
    if (options.length > 0) {
      const weapons = [
        ...new Set(
          options
            .flatMap((option) => (option.weapon ? option.weapon.split('|') : []))
            .map((part) => part.trim())
            .filter(Boolean),
        ),
      ];
      const hashNames = options
        .map((option) => option.marketHashName?.trim())
        .filter((name): name is string => Boolean(name));
      const qs = options
        .map((option) => option.q?.trim())
        .filter((q): q is string => Boolean(q));
      const rarities = [
        ...new Set(
          options
            .map((option) => option.rarity?.trim())
            .filter((rarity): rarity is string => Boolean(rarity)),
        ),
      ];

      const filter: CatalogCategoryFilter = {};
      if (weapons.length > 0) {
        filter.weapon = weapons.join('|');
      }
      if (hashNames.length === options.length) {
        filter.marketHashName = hashNames.join('|');
      }
      if (qs.length === options.length && new Set(qs).size === 1) {
        filter.q = qs[0];
      }
      if (rarities.length === 1) {
        filter.rarity = rarities[0];
      }
      return filter;
    }
  }

  return { ...EMPTY_CATEGORY_MATCH_FILTER };
}

function resolveTabLevelFilter(activeTabId: string): CatalogCategoryFilter {
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

/**
 * @param mode When omitted, non-empty values ⇒ subset, empty values ⇒ all (legacy tests).
 */
export function resolveCatalogFilter(
  activeTabId: string,
  categoryValue: string | readonly string[],
  mode?: CategorySelectionMode,
): CatalogCategoryFilter {
  if (activeTabId === 'all') {
    return {};
  }

  const values = normalizeCategoryValues(categoryValue);
  const resolvedMode: CategorySelectionMode =
    mode ?? (values.length > 0 ? 'subset' : 'all');

  if (resolvedMode === 'empty') {
    return { ...EMPTY_CATEGORY_MATCH_FILTER };
  }
  if (resolvedMode === 'subset') {
    return resolveSubsetFilter(values);
  }
  return resolveTabLevelFilter(activeTabId);
}

/**
 * Decode `?weapon=` into tab + selection mode (supports multi via `|`).
 */
export function decodeCategorySelection(weaponParam: string | null): {
  tabId: string;
  mode: CategorySelectionMode;
  values: string[];
} {
  if (!weaponParam?.trim()) {
    return { tabId: 'all', mode: 'all', values: [] };
  }
  const param = weaponParam.trim();
  if (param.startsWith(EMPTY_CATEGORY_URL_PREFIX)) {
    // Legacy empty bookmarks: treat as whole-tab browse (never a blank catalog).
    const tabId = param.slice(EMPTY_CATEGORY_URL_PREFIX.length) || 'all';
    return { tabId, mode: 'all', values: [] };
  }
  if (isTabLevelWeaponFilter(param)) {
    return { tabId: findTabForWeapon(param), mode: 'all', values: [] };
  }

  const parts = param
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  const byExactValue = parts
    .map((part) => {
      const option = CATALOG_CATEGORY_OPTIONS.find((entry) => entry.value === part);
      return option ?? null;
    })
    .filter((option): option is CatalogCategoryOption => Boolean(option));
  if (byExactValue.length === parts.length && byExactValue.length > 0) {
    const tabId = byExactValue[0]!.tabId;
    if (byExactValue.every((option) => option.tabId === tabId)) {
      return {
        tabId,
        mode: 'subset',
        values: byExactValue.map((option) => option.value),
      };
    }
  }

  if (parts.length === 1) {
    const option = findCategoryOption(parts[0]!);
    if (option) {
      return { tabId: option.tabId, mode: 'subset', values: [option.value] };
    }
  }

  const byWeaponLabel = parts
    .map((part) =>
      CATALOG_CATEGORY_OPTIONS.find(
        (entry) => entry.weapon === part && entry.tabId !== 'other',
      ),
    )
    .filter((option): option is CatalogCategoryOption => Boolean(option));
  if (byWeaponLabel.length === parts.length && byWeaponLabel.length > 0) {
    const tabId = byWeaponLabel[0]!.tabId;
    if (byWeaponLabel.every((option) => option.tabId === tabId)) {
      return {
        tabId,
        mode: 'subset',
        values: byWeaponLabel.map((option) => option.value),
      };
    }
  }

  return { tabId: findTabForWeapon(param), mode: 'all', values: [] };
}

/** Encode selection for the `weapon` URL param. */
export function encodeCategorySelection(
  tabId: string,
  mode: CategorySelectionMode,
  values: readonly string[] = [],
): string | undefined {
  if (tabId === 'all') {
    return undefined;
  }
  if (mode === 'empty') {
    return `${EMPTY_CATEGORY_URL_PREFIX}${tabId}`;
  }
  const normalized = normalizeCategoryValues(values);
  if (mode === 'subset' && normalized.length > 0) {
    return normalized.join('|');
  }
  const tab = WEAPON_CATEGORY_TABS.find((entry) => entry.id === tabId);
  const weaponParts = tab?.filter.weapon?.split('|') ?? [];
  if (tab?.filter.weapon && weaponParts.length <= 4) {
    return tab.filter.weapon;
  }
  return undefined;
}

export function hasActiveCatalogFilters(input: {
  search: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
  activeTabId: string;
  categoryValue?: string;
  categoryValues?: readonly string[];
  categoryMode?: CategorySelectionMode;
  wearFilter?: string;
  floatMin?: string;
  floatMax?: string;
  skinTraitFilters?: SkinTraitCheckboxState;
}): boolean {
  const selectedCategories =
    input.categoryValues ??
    (input.categoryValue ? normalizeCategoryValues(input.categoryValue) : []);
  const narrowedCategory =
    input.activeTabId !== 'all' &&
    (input.categoryMode === 'subset' ||
      input.categoryMode === 'empty' ||
      selectedCategories.length > 0);
  return Boolean(
    input.search.trim() ||
      input.minPrice.trim() ||
      input.maxPrice.trim() ||
      input.sort !== 'newest' ||
      input.activeTabId !== 'all' ||
      narrowedCategory ||
      input.wearFilter ||
      input.floatMin?.trim() ||
      input.floatMax?.trim() ||
      (input.skinTraitFilters
        ? hasActiveSkinTraitFilters(input.skinTraitFilters)
        : false),
  );
}
