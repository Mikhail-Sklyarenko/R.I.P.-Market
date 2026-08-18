import type { Locale } from '../i18n';

function ruPlural(count: number): 'one' | 'few' | 'many' {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return 'many';
  }
  if (mod10 === 1) {
    return 'one';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'few';
  }
  return 'many';
}

function labeledCount(
  count: number,
  locale: Locale,
  t: (key: string, params?: Record<string, string | number>) => string,
  prefix: 'filterItems' | 'filterStacks',
): string {
  const form = locale === 'en' ? (count === 1 ? 'one' : 'many') : ruPlural(count);
  return t(`inventory.${prefix}_${form}`, { count });
}

export function formatInventoryFilterTotal(input: {
  itemCount: number;
  stackCount: number;
  hiddenCount: number;
  visibleTotal: number;
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
}): string {
  const parts = [
    labeledCount(input.itemCount, input.locale, input.t, 'filterItems'),
  ];
  if (input.stackCount !== input.itemCount) {
    parts.push(
      labeledCount(input.stackCount, input.locale, input.t, 'filterStacks'),
    );
  }
  if (input.hiddenCount > 0) {
    parts.push(
      input.t('inventory.hiddenUnavailable', { count: input.hiddenCount }),
    );
  }
  const summary = parts.join(' · ');
  if (input.itemCount !== input.visibleTotal) {
    return `${summary} / ${input.visibleTotal}`;
  }
  return summary;
}
