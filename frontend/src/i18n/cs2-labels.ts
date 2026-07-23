import { enMessages } from './messages/en.ts';
import { ruMessages } from './messages/ru.ts';
import { translate } from './translate.ts';
import type { Locale } from './types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

function normalizeRarity(rarity: string): string {
  if (rarity === 'Mil-Spec') {
    return 'Mil-Spec Grade';
  }
  return rarity;
}

export function rarityLabel(
  rarity: string | null | undefined,
  locale: Locale,
): string | null {
  if (!rarity?.trim()) {
    return null;
  }
  const normalized = normalizeRarity(rarity.trim());
  const key = `rarity.${normalized}`;
  const translated = t(key, locale);
  return translated === key ? normalized : translated;
}

export function wearLabel(
  wear: string | null | undefined,
  locale: Locale,
): string | null {
  if (!wear) {
    return null;
  }
  const key = `wear.${wear}`;
  const translated = t(key, locale);
  return translated === key ? wear : translated;
}

export function catalogTabLabel(tabId: string, locale: Locale): string {
  const key = `catalog.tabs.${tabId}`;
  const translated = t(key, locale);
  return translated === key ? tabId : translated;
}

export function catalogOtherLabel(value: string, locale: Locale): string {
  const key = `catalog.other.${value}`;
  const translated = t(key, locale);
  return translated === key ? value : translated;
}

export function lotStatusLabel(status: string, locale: Locale): string {
  const key = `lotStatus.${status}`;
  const translated = t(key, locale);
  return translated === key ? status : translated;
}

export function lotSummaryLabel(status: string, locale: Locale): string {
  const key = `lotSummary.${status}`;
  const translated = t(key, locale);
  return translated === key ? status : translated;
}

export function assetStatusLabel(status: string, locale: Locale): string {
  const key = `assetStatus.${status}`;
  const translated = t(key, locale);
  return translated === key ? status : translated;
}

/** Russian-style plural for lots; English uses one/other. */
export function formatLotCountLabel(count: number, locale: Locale): string {
  if (locale === 'en') {
    const key = count === 1 ? 'plural.lot_one' : 'plural.lot_many';
    return t(key, locale, { count });
  }
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return t('plural.lot_many', locale, { count });
  }
  if (mod10 === 1) {
    return t('plural.lot_one', locale, { count });
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return t('plural.lot_few', locale, { count });
  }
  return t('plural.lot_many', locale, { count });
}

/** Russian-style plural for offers; English uses one/many. */
export function formatOfferCountLabel(count: number, locale: Locale): string {
  if (locale === 'en') {
    const key = count === 1 ? 'item.offers_one' : 'item.offers_many';
    return t(key, locale, { count });
  }
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return t('item.offers_many', locale, { count });
  }
  if (mod10 === 1) {
    return t('item.offers_one', locale, { count });
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return t('item.offers_few', locale, { count });
  }
  return t('item.offers_many', locale, { count });
}
