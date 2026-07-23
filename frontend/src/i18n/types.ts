export type Locale = 'ru' | 'en';

export const LOCALES: readonly Locale[] = ['ru', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'ru';

export const LOCALE_STORAGE_KEY = 'rip-market.locale';

export type TranslateParams = Record<string, string | number>;
