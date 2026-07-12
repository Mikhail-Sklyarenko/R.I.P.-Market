import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthConfig } from '../api/types';
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

  const requiredReady = steamLinked && tradeUrlReady;
  const extensionReady = !extensionChannelEnabled || extensionConnected;

  const steps: OnboardingStep[] = [
    {
      key: 'steam',
      label: 'Привязать Steam',
      hint: 'Нужен для синхронизации инвентаря CS2 и участия в сделках.',
      ready: steamLinked,
      actionHref: '#account-steam-section',
      actionLabel: steamLinked ? undefined : 'К привязке Steam',
    },
    {
      key: 'trade-url',
      label: 'Указать Trade URL',
      hint: 'Без ссылки на обмен покупка и продажа недоступны.',
      ready: tradeUrlReady,
      actionHref: '#account-trade-url-section',
      actionLabel: tradeUrlReady ? undefined : 'К Trade URL',
    },
  ];

  if (extensionChannelEnabled) {
    steps.push({
      key: 'extension',
      label: 'Подключить расширение',
      hint: extensionRuntimeAvailable
        ? 'Опционально: автоотправка trade offer при продаже.'
        : 'Опционально: установите Chrome-расширение для автообмена.',
      ready: extensionConnected,
      optional: true,
      actionHref: '#account-extension-section',
      actionLabel: extensionConnected ? undefined : 'К расширению',
    });
  }

  if (requiredReady && extensionReady) {
    return (
      <div className="card account-onboarding account-onboarding-ready" data-testid="account-trading-onboarding">
        <p className="account-onboarding-ready-text">
          Аккаунт готов к торговле.{' '}
          <Link to="/catalog">Перейти в каталог</Link>
          {' · '}
          <Link to="/sell/inventory">Открыть инвентарь</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card account-onboarding" data-testid="account-trading-onboarding">
      <h3 className="account-onboarding-title">Как начать торговать</h3>
      <p className="muted small account-onboarding-lead">
        Один аккаунт может и покупать, и продавать. Пройдите шаги ниже — порядок важен.
      </p>
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
                    <span className="account-onboarding-optional"> (опционально)</span>
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
      {requiredReady ? (
        <p className="muted small account-onboarding-next">
          Дальше: <Link to="/deals">Сделки</Link> — покупки, продажи и лоты в одном разделе.
        </p>
      ) : null}
    </div>
  );
}
