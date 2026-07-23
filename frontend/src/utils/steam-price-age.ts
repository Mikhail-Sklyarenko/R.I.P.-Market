import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

/** Human-readable Steam price age for item page hints. */
export function formatSteamPriceAge(
  fetchedAt: string | null | undefined,
  locale: Locale = 'ru',
): string | null {
  if (!fetchedAt?.trim()) {
    return null;
  }
  const fetchedMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedMs)) {
    return null;
  }

  const ageMs = Date.now() - fetchedMs;
  if (ageMs < 0) {
    return null;
  }

  const days = Math.floor(ageMs / DAY_MS);
  if (days <= 0) {
    return t('steamPriceAge.today', locale);
  }
  if (days === 1) {
    return t('steamPriceAge.yesterday', locale);
  }
  if (days < 14) {
    return t('steamPriceAge.daysAgo', locale, { days });
  }
  const weeks = Math.floor(days / 7);
  return weeks === 1
    ? t('steamPriceAge.oneWeekAgo', locale)
    : t('steamPriceAge.weeksAgo', locale, { weeks });
}

export function isSteamPriceStale(
  fetchedAt: string | null | undefined,
  staleAfterDays = 14,
): boolean {
  if (!fetchedAt?.trim()) {
    return false;
  }
  const fetchedMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedMs)) {
    return false;
  }
  return Date.now() - fetchedMs > staleAfterDays * DAY_MS;
}
