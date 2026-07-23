import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { enMessages } from './messages/en';
import { ruMessages } from './messages/ru';
import {
  applyDocumentLocale,
  readStoredLocale,
  writeStoredLocale,
} from './storage';
import { translate } from './translate';
import {
  DEFAULT_LOCALE,
  type Locale,
  type TranslateParams,
} from './types';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    applyDocumentLocale(next);
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslateParams) =>
      translate(messagesByLocale[locale], key, params),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}

/** Safe translator for modules that may run outside React (defaults to RU). */
export function tStatic(
  key: string,
  locale: Locale = DEFAULT_LOCALE,
  params?: TranslateParams,
): string {
  return translate(messagesByLocale[locale], key, params);
}
