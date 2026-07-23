import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale } from './types.ts';

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

export function readStoredLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // ignore storage failures
  }
  return DEFAULT_LOCALE;
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures
  }
}

export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = locale;
}
