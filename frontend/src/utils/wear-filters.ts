export const CATALOG_WEAR_FILTERS = [
  { value: 'FN', label: 'Factory New', color: '#5cb85c' },
  { value: 'MW', label: 'Minimal Wear', color: '#8bc34a' },
  { value: 'FT', label: 'Field-Tested', color: '#f0ad4e' },
  { value: 'WW', label: 'Well-Worn', color: '#ff7043' },
  { value: 'BS', label: 'Battle-Scarred', color: '#d9534f' },
] as const;

export type CatalogWearFilterValue = (typeof CATALOG_WEAR_FILTERS)[number]['value'];

export function getWearFilterTestId(value: string): string {
  if (!value) {
    return 'catalog-wear-all';
  }
  return `catalog-wear-${value.toLowerCase()}`;
}

export function getWearDisplayLabel(wear?: string | null): string | null {
  if (!wear) {
    return null;
  }
  const option = CATALOG_WEAR_FILTERS.find((entry) => entry.value === wear);
  return option?.label ?? wear;
}
