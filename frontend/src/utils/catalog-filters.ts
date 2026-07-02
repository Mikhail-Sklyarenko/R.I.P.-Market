export type CatalogCategoryFilter = {
  weapon?: string;
  rarity?: string;
  q?: string;
};

export type WeaponCategoryTab = {
  id: string;
  label: string;
  filter: CatalogCategoryFilter;
};

export type CatalogCategoryOption = {
  value: string;
  label: string;
  tabId: string;
  weapon?: string;
  rarity?: string;
};

export const CATALOG_PAGE_LIMITS = [20, 24] as const;
export type CatalogPageLimit = (typeof CATALOG_PAGE_LIMITS)[number];

export const WEAPON_CATEGORY_TABS: readonly WeaponCategoryTab[] = [
  { id: 'all', label: 'Все', filter: {} },
  { id: 'pistols', label: 'Пистолеты', filter: { q: 'Glock-18' } },
  { id: 'rifles', label: 'Винтовки', filter: { weapon: 'AK-47' } },
  { id: 'snipers', label: 'Снайперские', filter: { weapon: 'AWP' } },
  { id: 'smg', label: 'SMG', filter: { q: 'MP9' } },
  { id: 'shotguns', label: 'Дробовики', filter: { q: 'Nova' } },
  { id: 'knives', label: 'Ножи', filter: { q: 'Knife' } },
  { id: 'gloves', label: 'Перчатки', filter: { q: 'Gloves' } },
  { id: 'other', label: 'Другое', filter: { q: 'Sticker' } },
];

export const CATALOG_CATEGORY_OPTIONS: readonly CatalogCategoryOption[] = [
  { value: '', label: 'Все категории', tabId: 'all' },
  { value: 'Glock-18', label: 'Glock-18', weapon: 'Glock-18', tabId: 'pistols' },
  { value: 'USP-S', label: 'USP-S', weapon: 'USP-S', tabId: 'pistols' },
  { value: 'Desert Eagle', label: 'Desert Eagle', weapon: 'Desert Eagle', tabId: 'pistols' },
  { value: 'P250', label: 'P250', weapon: 'P250', tabId: 'pistols' },
  { value: 'AK-47', label: 'AK-47', weapon: 'AK-47', tabId: 'rifles' },
  { value: 'M4A4', label: 'M4A4', weapon: 'M4A4', tabId: 'rifles' },
  { value: 'M4A1-S', label: 'M4A1-S', weapon: 'M4A1-S', tabId: 'rifles' },
  { value: 'Galil AR', label: 'Galil AR', weapon: 'Galil AR', tabId: 'rifles' },
  { value: 'AWP', label: 'AWP', weapon: 'AWP', tabId: 'snipers' },
  { value: 'SSG 08', label: 'SSG 08', weapon: 'SSG 08', tabId: 'snipers' },
  { value: 'MP9', label: 'MP9', weapon: 'MP9', tabId: 'smg' },
  { value: 'MAC-10', label: 'MAC-10', weapon: 'MAC-10', tabId: 'smg' },
  { value: 'Nova', label: 'Nova', weapon: 'Nova', tabId: 'shotguns' },
  { value: 'XM1014', label: 'XM1014', weapon: 'XM1014', tabId: 'shotguns' },
  { value: 'Karambit', label: 'Karambit', weapon: 'Karambit', tabId: 'knives' },
  { value: 'Bayonet', label: 'Bayonet', weapon: 'Bayonet', tabId: 'knives' },
  {
    value: 'gloves-extraordinary',
    label: 'Перчатки',
    rarity: 'Extraordinary',
    tabId: 'gloves',
  },
];

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
}): boolean {
  return Boolean(
    input.search.trim() ||
      input.minPrice.trim() ||
      input.maxPrice.trim() ||
      input.sort !== 'newest' ||
      input.activeTabId !== 'all' ||
      input.categoryValue,
  );
}
