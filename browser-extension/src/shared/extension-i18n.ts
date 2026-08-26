/**
 * H1: Extension i18n — t(locale, key) + storage sync with the website.
 */
import {
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
  type ExtensionMessageTree,
  type ExtensionTranslateParams,
  getStoredExtensionLocale,
  isExtensionLocale,
  localeToBcp47,
  normalizeExtensionLocale,
  setStoredExtensionLocale,
  translateExtension,
} from './extension-i18n-core.js';
import { extensionMessagesEn } from './extension-messages-en.js';
import { extensionMessagesRu } from './extension-messages-ru.js';

export type {
  ExtensionLocale,
  ExtensionMessageTree,
  ExtensionTranslateParams,
} from './extension-i18n-core.js';

export {
  DEFAULT_EXTENSION_LOCALE,
  EXTENSION_LOCALES,
  EXTENSION_LOCALE_STORAGE_KEY,
  getStoredExtensionLocale,
  isExtensionLocale,
  localeToBcp47,
  normalizeExtensionLocale,
  setStoredExtensionLocale,
} from './extension-i18n-core.js';

const messagesByLocale: Record<ExtensionLocale, ExtensionMessageTree> = {
  ru: extensionMessagesRu,
  en: extensionMessagesEn,
};

export function tx(
  locale: ExtensionLocale,
  key: string,
  params?: ExtensionTranslateParams,
): string {
  return translateExtension(messagesByLocale[locale], key, params);
}

export function createExtensionT(locale: ExtensionLocale) {
  return (key: string, params?: ExtensionTranslateParams) =>
    tx(locale, key, params);
}

/** Prefer explicit → stored → browser language → default RU. */
export async function resolveExtensionLocale(
  preferred?: unknown,
): Promise<ExtensionLocale> {
  if (isExtensionLocale(preferred)) {
    return preferred;
  }
  const stored = await getStoredExtensionLocale();
  if (preferred != null) {
    return normalizeExtensionLocale(preferred, stored);
  }
  if (stored !== DEFAULT_EXTENSION_LOCALE) {
    return stored;
  }
  try {
    const nav =
      typeof navigator !== 'undefined' ? navigator.language : undefined;
    return normalizeExtensionLocale(nav, stored);
  } catch {
    return stored;
  }
}
