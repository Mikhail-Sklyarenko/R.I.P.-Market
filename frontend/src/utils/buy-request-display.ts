import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

/** Short relative age for an open buy request. */
export function formatBuyRequestCreatedAge(
  createdAt: string | null | undefined,
  locale: Locale = 'ru',
): string | null {
  if (!createdAt?.trim()) {
    return null;
  }
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return null;
  }

  const ageMs = Date.now() - createdMs;
  if (ageMs < 0) {
    return null;
  }
  if (ageMs < MINUTE_MS) {
    return t('buyRequestPanel.createdJustNow', locale);
  }
  if (ageMs < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(ageMs / MINUTE_MS));
    return t('buyRequestPanel.createdMinutesAgo', locale, { count: minutes });
  }
  if (ageMs < DAY_MS) {
    const hours = Math.max(1, Math.floor(ageMs / HOUR_MS));
    return t('buyRequestPanel.createdHoursAgo', locale, { count: hours });
  }
  const days = Math.max(1, Math.floor(ageMs / DAY_MS));
  return t('buyRequestPanel.createdDaysAgo', locale, { count: days });
}
