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
};

export const CATALOG_PAGE_LIMITS = [20, 24] as const;
export type CatalogPageLimit = (typeof CATALOG_PAGE_LIMITS)[number];

export const WEAPON_CATEGORY_TABS: readonly WeaponCategoryTab[] = [
  { id: 'all', label: 'Все', icon: 'all', filter: {} },
  { id: 'knives', label: 'Нож', icon: 'knife', filter: { q: 'Knife' } },
  { id: 'pistols', label: 'Пистолет', icon: 'pistol', filter: { q: 'Glock-18' } },
  { id: 'rifles', label: 'Винтовка', icon: 'rifle', filter: { weapon: 'AK-47' } },
  { id: 'snipers', label: 'Снайперская', icon: 'sniper', filter: { weapon: 'AWP' } },
  { id: 'smg', label: 'SMG', icon: 'smg', filter: { q: 'MP9' } },
  { id: 'shotguns', label: 'Дробовики', icon: 'shotgun', filter: { q: 'Nova' } },
  { id: 'gloves', label: 'Перчатки', icon: 'gloves', filter: { q: 'Gloves' } },
  { id: 'other', label: 'Другое', icon: 'other', filter: { q: 'Sticker' } },
];

export const CATALOG_CATEGORY_OPTIONS: readonly CatalogCategoryOption[] = [
  { value: '', label: 'Все категории', tabId: 'all', icon: 'all' },
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
    value: 'Desert Eagle',
    label: 'Desert Eagle',
    weapon: 'Desert Eagle',
    tabId: 'pistols',
    icon: 'pistol',
    modelIcon: 'desert-eagle',
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
    value: 'AK-47',
    label: 'AK-47',
    weapon: 'AK-47',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'ak-47',
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
    value: 'M4A1-S',
    label: 'M4A1-S',
    weapon: 'M4A1-S',
    tabId: 'rifles',
    icon: 'rifle',
    modelIcon: 'm4a1-s',
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
    value: 'AWP',
    label: 'AWP',
    weapon: 'AWP',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'awp',
  },
  {
    value: 'SSG 08',
    label: 'SSG 08',
    weapon: 'SSG 08',
    tabId: 'snipers',
    icon: 'sniper',
    modelIcon: 'ssg-08',
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
    value: 'MAC-10',
    label: 'MAC-10',
    weapon: 'MAC-10',
    tabId: 'smg',
    icon: 'smg',
    modelIcon: 'mac-10',
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
    value: 'XM1014',
    label: 'XM1014',
    weapon: 'XM1014',
    tabId: 'shotguns',
    icon: 'shotgun',
    modelIcon: 'xm1014',
  },
  {
    value: 'Karambit',
    label: 'Karambit',
    weapon: 'Karambit',
    tabId: 'knives',
    icon: 'knife',
    modelIcon: 'karambit',
  },
  {
    value: 'Bayonet',
    label: 'Bayonet',
    weapon: 'Bayonet',
    tabId: 'knives',
    icon: 'knife',
    modelIcon: 'bayonet',
  },
  {
    value: 'gloves-extraordinary',
    label: 'Перчатки',
    rarity: 'Extraordinary',
    tabId: 'gloves',
    icon: 'gloves',
    modelIcon: 'gloves-extraordinary',
  },
];

export function getCategoryOptionsForTab(tabId: string): CatalogCategoryOption[] {
  return CATALOG_CATEGORY_OPTIONS.filter(
    (option) => option.tabId === tabId && option.value,
  );
}

export function findCategoryOption(value: string): CatalogCategoryOption | undefined {
  return CATALOG_CATEGORY_OPTIONS.find((option) => option.value === value);
}

export function findTabForWeapon(weapon: string): string {
  const option = CATALOG_CATEGORY_OPTIONS.find((entry) => entry.weapon === weapon);
  return option?.tabId ?? 'all';
}

export function resolveCatalogFilter(
  activeTabId: string,
  categoryValue: string,
): CatalogCategoryFilter {
  if (categoryValue) {
    const option = findCategoryOption(categoryValue);
    if (option) {
      return {
        ...(option.weapon ? { weapon: option.weapon } : {}),
        ...(option.rarity ? { rarity: option.rarity } : {}),
      };
    }
  }

  const tab = WEAPON_CATEGORY_TABS.find((entry) => entry.id === activeTabId);
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
}): boolean {
  return Boolean(
    input.search.trim() ||
      input.minPrice.trim() ||
      input.maxPrice.trim() ||
      input.sort !== 'newest' ||
      input.activeTabId !== 'all' ||
      input.categoryValue ||
      input.wearFilter,
  );
}
