import { LOCALES, useLocale, type Locale } from '../i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t('nav.language')}
      data-testid="language-switcher"
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className={`language-switcher-btn${locale === code ? ' active' : ''}`}
          aria-pressed={locale === code}
          data-testid={`language-${code}`}
          title={code === 'ru' ? t('language.switchToRu') : t('language.switchToEn')}
          onClick={() => setLocale(code as Locale)}
        >
          {t(`language.${code}`)}
        </button>
      ))}
    </div>
  );
}
