import { CATALOG_WEAR_FILTERS } from './wear-filters.ts';

export function parseCatalogLotName(marketHashName: string): {
  weapon: string;
  skin: string;
} {
  const parts = marketHashName.split(' | ');
  if (parts.length < 2) {
    return { weapon: '', skin: marketHashName.trim() };
  }

  const weapon = parts[0]?.trim() ?? '';
  const skinWithWear = parts.slice(1).join(' | ').trim();
  const skin = skinWithWear.replace(/\s*\([^)]+\)\s*$/, '').trim();

  return {
    weapon,
    skin: skin || skinWithWear,
  };
}

export function getWearBadgeStyle(wear?: string | null): {
  label: string;
  color: string;
} | null {
  if (!wear) {
    return null;
  }

  const lisWearColors: Record<string, string> = {
    FN: '#6ecf6e',
    MW: '#7fd67f',
    FT: '#5fd0d5',
    WW: '#ffb454',
    BS: '#ff6b57',
  };

  const option = CATALOG_WEAR_FILTERS.find((entry) => entry.value === wear);
  if (!option) {
    return { label: wear, color: '#94a3b8' };
  }

  return {
    label: option.label,
    color: lisWearColors[option.value] ?? option.color,
  };
}
