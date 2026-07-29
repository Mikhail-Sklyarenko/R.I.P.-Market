import { useLocale } from '../i18n';

function ShieldIcon() {
  return (
    <svg
      className="trust-notice-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2.5 5 5.5v5.8c0 4.2 2.9 8.1 7 9.2 4.1-1.1 7-5 7-9.2V5.5L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m9.2 12.1 1.8 1.8 4.2-4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact trust signal — one line, no sales card competing with catalog. */
export function TrustBanner() {
  const { t } = useLocale();

  return (
    <aside className="trust-notice" data-testid="trust-banner">
      <ShieldIcon />
      <p className="trust-notice-text">
        <span className="trust-notice-title">{t('trustBanner.title')}</span>
        <span className="trust-notice-sep" aria-hidden="true">
          ·
        </span>
        <span className="trust-notice-subtitle">{t('trustBanner.subtitle')}</span>
      </p>
    </aside>
  );
}
