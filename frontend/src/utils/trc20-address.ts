import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale) {
  return translate(messagesByLocale[locale], key);
}

const TRC20_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidTrc20Address(address: string): boolean {
  return TRC20_ADDRESS_RE.test(address.trim());
}

export function getTrc20AddressError(address: string, locale: Locale = 'ru'): string | null {
  const trimmed = address.trim();
  if (!trimmed) {
    return t('trc20Address.required', locale);
  }
  if (!trimmed.startsWith('T')) {
    return t('trc20Address.mustStartWithT', locale);
  }
  if (!isValidTrc20Address(trimmed)) {
    return t('trc20Address.invalid', locale);
  }
  return null;
}
