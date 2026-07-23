import { useLocale } from '../i18n';

function ShieldIcon() {
  return (
    <svg
      className="trust-banner-icon"
      width="32"
      height="32"
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

export function TrustBanner() {
  const { t } = useLocale();
  const steps = [t('trustBanner.step1'), t('trustBanner.step2'), t('trustBanner.step3')];

  return (
    <div className="card trust-banner" data-testid="trust-banner">
      <div className="trust-banner-main">
        <ShieldIcon />
        <div className="trust-banner-copy">
          <h3 className="trust-banner-title">{t('trustBanner.title')}</h3>
          <p className="muted small trust-banner-subtitle">{t('trustBanner.subtitle')}</p>
        </div>
      </div>

      <ol className="trust-banner-steps" aria-label={t('trustBanner.stepsAria')}>
        {steps.map((step, index) => (
          <li
            key={step}
            className="trust-banner-step"
            data-testid={`trust-banner-step-${index + 1}`}
          >
            <span className="trust-banner-step-marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="trust-banner-step-label">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
