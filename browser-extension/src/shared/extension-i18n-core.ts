/**
 * H1: Extension locale — same ru/en contract as the website.
 */
export type ExtensionLocale = 'ru' | 'en';

export const EXTENSION_LOCALES = ['ru', 'en'] as const;
export const DEFAULT_EXTENSION_LOCALE: ExtensionLocale = 'ru';
export const EXTENSION_LOCALE_STORAGE_KEY = 'rip:extension.locale';

export type ExtensionTranslateParams = Record<string, string | number>;

export type ExtensionMessageTree = {
  [key: string]: string | ExtensionMessageTree;
};

export function isExtensionLocale(value: unknown): value is ExtensionLocale {
  return value === 'ru' || value === 'en';
}

export function normalizeExtensionLocale(
  value: unknown,
  fallback: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ExtensionLocale {
  if (isExtensionLocale(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower.startsWith('en')) {
      return 'en';
    }
    if (lower.startsWith('ru')) {
      return 'ru';
    }
  }
  return fallback;
}

export function getMessageByPath(
  tree: ExtensionMessageTree,
  path: string,
): string | undefined {
  const parts = path.split('.');
  let current: string | ExtensionMessageTree | undefined = tree;
  for (const part of parts) {
    if (current == null || typeof current === 'string') {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolateExtension(
  template: string,
  params?: ExtensionTranslateParams,
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function translateExtension(
  tree: ExtensionMessageTree,
  key: string,
  params?: ExtensionTranslateParams,
): string {
  const template = getMessageByPath(tree, key);
  if (template == null) {
    return key;
  }
  return interpolateExtension(template, params);
}

export function localeToBcp47(locale: ExtensionLocale): string {
  return locale === 'en' ? 'en-US' : 'ru-RU';
}

/** Sync read from chrome.storage snapshot (popup/content after await get). */
export async function getStoredExtensionLocale(): Promise<ExtensionLocale> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      const stored = await chrome.storage.local.get(EXTENSION_LOCALE_STORAGE_KEY);
      return normalizeExtensionLocale(stored[EXTENSION_LOCALE_STORAGE_KEY]);
    }
  } catch {
    // ignore
  }
  return DEFAULT_EXTENSION_LOCALE;
}

export async function setStoredExtensionLocale(
  locale: ExtensionLocale,
): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({
        [EXTENSION_LOCALE_STORAGE_KEY]: locale,
      });
    }
  } catch {
    // ignore
  }
}
