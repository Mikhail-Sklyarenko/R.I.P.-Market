import type { Locale } from '../i18n/types';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

/** Pluralized “N buyer(s) ready to pay up to” prefix for the seller hint. */
export function formatBuyerSellHintPrefix(count: number, locale: Locale): string {
  if (locale === 'en') {
    const key = count === 1 ? 'orderBook.sellHint_one' : 'orderBook.sellHint_many';
    return t(key, locale, { count });
  }
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return t('orderBook.sellHint_many', locale, { count });
  }
  if (mod10 === 1) {
    return t('orderBook.sellHint_one', locale, { count });
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return t('orderBook.sellHint_few', locale, { count });
  }
  return t('orderBook.sellHint_many', locale, { count });
}
