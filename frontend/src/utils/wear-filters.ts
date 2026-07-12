export const CATALOG_WEAR_FILTERS = [
  { value: 'FN', label: 'Прямо с завода', color: '#5cb85c' },
  { value: 'MW', label: 'Немного поношенное', color: '#8bc34a' },
  { value: 'FT', label: 'После полевых испытаний', color: '#f0ad4e' },
  { value: 'WW', label: 'Поношённое', color: '#ff7043' },
  { value: 'BS', label: 'Закалённое в боях', color: '#d9534f' },
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
