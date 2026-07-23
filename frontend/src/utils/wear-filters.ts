import { wearLabel } from '../i18n/cs2-labels.ts';
import type { Locale } from '../i18n/types.ts';

export const CATALOG_WEAR_FILTERS = [
  { value: 'FN', color: '#5cb85c' },
  { value: 'MW', color: '#8bc34a' },
  { value: 'FT', color: '#f0ad4e' },
  { value: 'WW', color: '#ff7043' },
  { value: 'BS', color: '#d9534f' },
] as const;

export type CatalogWearFilterValue = (typeof CATALOG_WEAR_FILTERS)[number]['value'];

export function getWearFilterTestId(value: string): string {
  if (!value) {
    return 'catalog-wear-all';
  }
  return `catalog-wear-${value.toLowerCase()}`;
}

export function getWearDisplayLabel(
  wear?: string | null,
  locale: Locale = 'ru',
): string | null {
  return wearLabel(wear, locale);
}
