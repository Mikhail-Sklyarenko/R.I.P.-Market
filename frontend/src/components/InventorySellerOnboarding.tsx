import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';

type InventorySellerOnboardingProps = {
  steamLinked: boolean;
  tradeUrlReady: boolean;
  itemSelected: boolean;
  sellPanelOpen: boolean;
  onDismiss?: () => void;
};

function StepMark({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="account-onboarding-mark account-onboarding-mark-ok" aria-hidden="true">
        ✓
      </span>
    );
  }
  return (
    <span className="account-onboarding-mark" aria-hidden="true">
      ○
    </span>
  );
}

export function InventorySellerOnboarding({
  steamLinked,
  tradeUrlReady,
  itemSelected,
  sellPanelOpen,
  onDismiss,
}: InventorySellerOnboardingProps) {
  const { t } = useLocale();

  const steps = [
    {
      key: 'steam',
      label: t('inventory.onboarding.stepSteam'),
      hint: t('inventory.onboarding.stepSteamHint'),
      ready: steamLinked,
      action: !steamLinked ? (
        <Link className="button secondary sm account-onboarding-action" to="/account">
          {t('inventory.onboarding.goAccount')}
        </Link>
      ) : null,
    },
    {
      key: 'trade-url',
      label: t('inventory.onboarding.stepTradeUrl'),
      hint: t('inventory.onboarding.stepTradeUrlHint'),
      ready: tradeUrlReady,
      action:
        steamLinked && !tradeUrlReady ? (
          <Link className="button secondary sm account-onboarding-action" to="/account">
            {t('inventory.onboarding.goAccount')}
          </Link>
        ) : null,
    },
    {
      key: 'pick-item',
      label: t('inventory.onboarding.stepPickItem'),
      hint: t('inventory.onboarding.stepPickItemHint'),
      ready: itemSelected,
      action: null,
    },
    {
      key: 'list',
      label: t('inventory.onboarding.stepList'),
      hint: t('inventory.onboarding.stepListHint'),
      ready: sellPanelOpen,
      action: null,
    },
  ];

  return (
    <div className="card account-onboarding inventory-seller-onboarding" data-testid="inventory-seller-onboarding">
      <div className="inventory-seller-onboarding-header">
        <div>
          <h3 className="account-onboarding-title">{t('inventory.onboarding.title')}</h3>
          <p className="muted small account-onboarding-lead">{t('inventory.onboarding.lead')}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="button ghost sm"
            data-testid="inventory-onboarding-dismiss"
            onClick={onDismiss}
          >
            {t('inventory.onboarding.dismiss')}
          </button>
        ) : null}
      </div>
      <ol className="account-onboarding-list">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`account-onboarding-step account-onboarding-step-${step.ready ? 'ok' : 'pending'}`}
            data-testid={`inventory-onboarding-step-${step.key}`}
          >
            <div className="account-onboarding-step-head">
              <StepMark ready={step.ready} />
              <div className="account-onboarding-step-copy">
                <span className="account-onboarding-step-label">
                  {index + 1}. {step.label}
                </span>
                <p className="muted small account-onboarding-step-hint">{step.hint}</p>
              </div>
            </div>
            {step.action}
          </li>
        ))}
      </ol>
    </div>
  );
}
