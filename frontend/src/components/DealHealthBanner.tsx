import { useState } from 'react';
import type { DealHealth } from '../utils/deal-health';
import { useLocale } from '../i18n';

type DealHealthBannerProps = {
  health: DealHealth;
  onCopyDebugPack?: () => Promise<void> | void;
};

export function DealHealthBanner({ health, onCopyDebugPack }: DealHealthBannerProps) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!onCopyDebugPack) {
      return;
    }
    await onCopyDebugPack();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`deal-health-banner deal-health-banner--${health.tone}`}
      data-testid="deal-health-banner"
      data-tone={health.tone}
    >
      <div className="deal-health-banner-body">
        <strong>{t(health.titleKey)}</strong>
        <p className="muted small">{t(health.bodyKey)}</p>
        {health.supportCode ? (
          <p className="muted small" data-testid="deal-health-support-code">
            {t('dealHealth.supportCodeLabel')}: <code>{health.supportCode}</code>
          </p>
        ) : null}
      </div>
      {onCopyDebugPack ? (
        <button
          type="button"
          className="button secondary sm"
          data-testid="deal-health-copy-debug"
          onClick={() => void handleCopy()}
        >
          {copied ? t('dealHealth.debugCopied') : t('dealHealth.copyDebugPack')}
        </button>
      ) : null}
    </div>
  );
}
