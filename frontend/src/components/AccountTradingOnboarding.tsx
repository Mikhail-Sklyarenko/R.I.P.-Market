import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthConfig } from '../api/types';
import { useLocale } from '../i18n';
import { hasLinkedSteamId } from '../utils/steam-id';
import { hasTradeUrl } from '../utils/trade-url';
import {
  getExtensionRuntimeStatus,
  isExtensionRuntimeAvailable,
} from '../utils/extension';

type AccountTradingOnboardingProps = {
  steamId?: string | null;
  tradeUrl?: string | null;
  config?: AuthConfig | null;
};

type OnboardingStep = {
  key: string;
  label: string;
  hint: string;
  ready: boolean;
  optional?: boolean;
  actionHref?: string;
  actionLabel?: string;
};

function StepMark({ ready, optional }: { ready: boolean; optional?: boolean }) {
  if (ready) {
    return (
      <span className="account-onboarding-mark account-onboarding-mark-ok" aria-hidden="true">
        ✓
      </span>
    );
  }
  return (
    <span
      className={`account-onboarding-mark${optional ? ' account-onboarding-mark-optional' : ''}`}
      aria-hidden="true"
    >
      {optional ? '○' : '✗'}
    </span>
  );
}

export function AccountTradingOnboarding({
  steamId,
  tradeUrl,
  config,
}: AccountTradingOnboardingProps) {
  const { t } = useLocale();
  const [extensionConnected, setExtensionConnected] = useState(false);
  const steamLinked = hasLinkedSteamId(steamId);
  const tradeUrlReady = hasTradeUrl(tradeUrl);
  const extensionChannelEnabled = Boolean(config?.extension?.extensionChannelEnabled);
  const extensionRuntimeAvailable = isExtensionRuntimeAvailable();

  useEffect(() => {
    if (!extensionChannelEnabled) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const status = await getExtensionRuntimeStatus();
      if (!cancelled) {
        setExtensionConnected(status.connected);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [extensionChannelEnabled]);

  // Required path only — optional extension must not keep the full checklist open.
  const requiredReady = steamLinked && tradeUrlReady;

  const steps: OnboardingStep[] = [
    {
      key: 'steam',
      label: t('onboarding.steamLabel'),
      hint: t('onboarding.steamHint'),
      ready: steamLinked,
      actionHref: '#account-steam-section',
      actionLabel: steamLinked ? undefined : t('onboarding.steamAction'),
    },
    {
      key: 'trade-url',
      label: t('onboarding.tradeUrlLabel'),
      hint: t('onboarding.tradeUrlHint'),
      ready: tradeUrlReady,
      actionHref: '#account-trade-url-section',
      actionLabel: tradeUrlReady ? undefined : t('onboarding.tradeUrlAction'),
    },
  ];

  if (extensionChannelEnabled && !requiredReady) {
    steps.push({
      key: 'extension',
      label: t('onboarding.extensionLabel'),
      hint: extensionRuntimeAvailable
        ? t('onboarding.extensionHintOptional')
        : t('onboarding.extensionHintInstall'),
      ready: extensionConnected,
      optional: true,
      actionHref: '#account-extension-section',
      actionLabel: extensionConnected ? undefined : t('onboarding.extensionAction'),
    });
  }

  if (requiredReady) {
    return (
      <div className="card account-onboarding account-onboarding-ready" data-testid="account-trading-onboarding">
        <p className="account-onboarding-ready-text">
          {t('onboarding.readyText')}
          {extensionChannelEnabled && !extensionConnected
            ? ` ${t('onboarding.readyExtensionOptional')}`
            : ''}
          .{' '}
          <Link to="/catalog">{t('onboarding.catalogLink')}</Link>
          {' · '}
          <Link to="/sell/inventory">{t('onboarding.inventoryLink')}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card account-onboarding" data-testid="account-trading-onboarding">
      <h3 className="account-onboarding-title">{t('onboarding.title')}</h3>
      <p className="muted small account-onboarding-lead">{t('onboarding.lead')}</p>
      <ol className="account-onboarding-list">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`account-onboarding-step account-onboarding-step-${step.ready ? 'ok' : 'pending'}`}
            data-testid={`account-onboarding-step-${step.key}`}
          >
            <div className="account-onboarding-step-head">
              <StepMark ready={step.ready} optional={step.optional} />
              <div className="account-onboarding-step-copy">
                <span className="account-onboarding-step-label">
                  {index + 1}. {step.label}
                  {step.optional ? (
                    <span className="account-onboarding-optional"> {t('onboarding.optionalSuffix')}</span>
                  ) : null}
                </span>
                <p className="muted small account-onboarding-step-hint">{step.hint}</p>
              </div>
            </div>
            {!step.ready && step.actionHref && step.actionLabel ? (
              <a className="button secondary sm account-onboarding-action" href={step.actionHref}>
                {step.actionLabel}
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
