import { useEffect, useId, useRef, useState } from 'react';
import { LOCALES, useLocale, type Locale } from '../i18n';

const LOCALE_META: Record<
  Locale,
  { flag: string; nameKey: 'language.switchToRu' | 'language.switchToEn' }
> = {
  ru: { flag: '🇷🇺', nameKey: 'language.switchToRu' },
  en: { flag: '🇺🇸', nameKey: 'language.switchToEn' },
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeTimerRef = useRef<number | null>(null);

  const current = LOCALE_META[locale];

  function clearCloseTimer() {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  function selectLocale(next: Locale) {
    setLocale(next);
    setOpen(false);
  }

  return (
    <div
      className={`language-switcher${open ? ' is-open' : ''}`}
      ref={rootRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      data-testid="language-switcher"
    >
      <button
        type="button"
        className="language-switcher-trigger"
        aria-label={t('nav.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="language-switcher-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="language-switcher-flag" aria-hidden="true">
          {current.flag}
        </span>
        <span className="language-switcher-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="language-switcher-menu"
          role="menu"
          aria-label={t('nav.language')}
          data-testid="language-switcher-menu"
        >
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const selected = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`language-switcher-option${selected ? ' active' : ''}`}
                data-testid={`language-${code}`}
                onClick={() => selectLocale(code)}
              >
                <span className="language-switcher-flag" aria-hidden="true">
                  {meta.flag}
                </span>
                <span>{t(meta.nameKey)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
