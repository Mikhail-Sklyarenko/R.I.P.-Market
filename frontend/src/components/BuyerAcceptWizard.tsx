import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import type { Order } from '../api/types';
import {
  hasBuyerWizardOfferOpened,
  markBuyerWizardOfferOpened,
  resolveBuyerAcceptWizard,
  type BuyerAcceptWizardStepState,
} from '../utils/buyer-accept-wizard';
import { buildTradeProblemSupportPath } from '../utils/trade-timeout-escalation';

type BuyerAcceptWizardProps = {
  order: Order;
  extensionConnected?: boolean;
  ackEnabled?: boolean;
  acknowledging?: boolean;
  remainingMinutes?: number | null;
  onAcknowledgePreAccept?: () => void;
  onAcknowledgeReceived?: () => void;
};

function stepStateLabel(
  state: BuyerAcceptWizardStepState,
  t: (key: string) => string,
): string {
  switch (state) {
    case 'done':
      return t('buyerAcceptWizard.stateDone');
    case 'current':
      return t('buyerAcceptWizard.stateCurrent');
    default:
      return t('buyerAcceptWizard.stateUpcoming');
  }
}

/**
 * C2+C3: guided accept — open offer → verify → Accept,
 * with pre-accept / received ack as primary scenario actions (not in <details>).
 */
export function BuyerAcceptWizard({
  order,
  extensionConnected = false,
  ackEnabled = false,
  acknowledging = false,
  remainingMinutes = null,
  onAcknowledgePreAccept,
  onAcknowledgeReceived,
}: BuyerAcceptWizardProps) {
  const { t } = useLocale();
  const [openedLocally, setOpenedLocally] = useState(() =>
    hasBuyerWizardOfferOpened(order.id),
  );

  const view = resolveBuyerAcceptWizard({
    order,
    role: 'buyer',
    extensionConnected,
    offerOpenedLocally: openedLocally,
    ackEnabled,
  });

  if (!view?.visible) {
    return null;
  }

  function handlePrimaryClick() {
    markBuyerWizardOfferOpened(order.id);
    setOpenedLocally(true);
  }

  const showPreAccept =
    view.ack.showPreAccept && Boolean(onAcknowledgePreAccept) && openedLocally;
  const showReceived =
    view.ack.showReceived && Boolean(onAcknowledgeReceived);
  const steamLinkIsSecondary = showPreAccept && view.steps[1]?.state === 'current';
  const problemReason = view.blockedByMismatch ? 'mismatch' : 'trade_problem';
  const problemPath = buildTradeProblemSupportPath({
    order,
    role: 'buyer',
    reason: problemReason,
    remainingMinutes,
  });

  return (
    <section
      className={`buyer-accept-wizard${view.blockedByMismatch ? ' buyer-accept-wizard--blocked' : ''}`}
      data-testid="buyer-accept-wizard"
      data-blocked={view.blockedByMismatch ? 'true' : 'false'}
    >
      <p className="eyebrow">{t('buyerAcceptWizard.eyebrow')}</p>
      <strong className="buyer-accept-wizard-title">
        {t('buyerAcceptWizard.title')}
      </strong>
      <p className="muted small">{t('buyerAcceptWizard.subtitle')}</p>

      {view.blockedByMismatch ? (
        <div className="alert alert-error" data-testid="buyer-accept-wizard-mismatch">
          <strong>{t('buyerAcceptWizard.mismatchTitle')}</strong>
          <p className="muted small">{t('buyerAcceptWizard.mismatchBody')}</p>
          <Link
            to={problemPath}
            data-testid="buyer-accept-wizard-problem"
            onClick={() => {
              buildTradeProblemSupportPath(
                {
                  order,
                  role: 'buyer',
                  reason: 'mismatch',
                  remainingMinutes,
                },
                { persist: true },
              );
            }}
          >
            {t('tradeEscalation.problemCta')}
          </Link>
        </div>
      ) : null}

      <ol className="buyer-accept-wizard-steps">
        {view.steps.map((step, index) => (
          <li
            key={step.id}
            className={`buyer-accept-wizard-step state-${step.state}`}
            data-step={step.id}
            data-state={step.state}
          >
            <div className="buyer-accept-wizard-step-head">
              <span className="buyer-accept-wizard-index">{index + 1}</span>
              <div>
                <strong>{t(step.titleKey)}</strong>
                <span className="buyer-accept-wizard-state">
                  {stepStateLabel(step.state, t)}
                </span>
              </div>
            </div>
            <p className="muted small">{t(step.bodyKey)}</p>
          </li>
        ))}
      </ol>

      {!view.blockedByMismatch && showPreAccept ? (
        <div className="buyer-accept-ack" data-testid="buyer-ack-preaccept-cta">
          <strong>{t('buyerAcceptWizard.preAcceptTitle')}</strong>
          <p className="muted small">{t('buyerAcceptWizard.preAcceptBody')}</p>
          <button
            type="button"
            className="button primary"
            disabled={acknowledging}
            data-testid="buyer-ack-preaccept"
            onClick={onAcknowledgePreAccept}
          >
            {acknowledging
              ? t('orderTradePanel.saving')
              : t('buyerAcceptWizard.preAcceptCta')}
          </button>
        </div>
      ) : null}

      {!view.blockedByMismatch && view.ack.preAcceptDone && !view.ack.receivedDone ? (
        <p className="alert alert-success" data-testid="buyer-extension-ack">
          {t('buyerAcceptWizard.preAcceptDone')}
        </p>
      ) : null}

      {!view.blockedByMismatch && view.primary.href ? (
        <a
          className={`button ${steamLinkIsSecondary ? 'secondary' : 'primary'}`}
          href={view.primary.href}
          target="_blank"
          rel="noreferrer"
          data-testid="buyer-accept-wizard-primary"
          data-kind={view.primary.kind}
          onClick={handlePrimaryClick}
        >
          {t(view.primary.labelKey)}
        </a>
      ) : null}

      {!view.blockedByMismatch && showReceived ? (
        <div className="buyer-accept-ack" data-testid="buyer-ack-received-cta">
          <strong>{t('buyerAcceptWizard.receivedTitle')}</strong>
          <p className="muted small">{t('buyerAcceptWizard.receivedBody')}</p>
          <button
            type="button"
            className="button primary"
            disabled={acknowledging}
            data-testid="buyer-ack-received"
            onClick={onAcknowledgeReceived}
          >
            {acknowledging
              ? t('orderTradePanel.saving')
              : t('buyerAcceptWizard.receivedCta')}
          </button>
        </div>
      ) : null}

      {!view.blockedByMismatch && view.ack.receivedDone ? (
        <p className="alert alert-success" data-testid="buyer-received-ack">
          {t('buyerAcceptWizard.receivedDone')}
        </p>
      ) : null}

      {!view.blockedByMismatch ? (
        <p className="muted small" data-testid="buyer-accept-wizard-return-hint">
          {t('buyerAcceptWizard.returnHint')}
        </p>
      ) : null}

      {!view.blockedByMismatch ? (
        <Link
          className="button ghost sm buyer-accept-problem"
          to={problemPath}
          data-testid="buyer-accept-wizard-problem"
          onClick={() => {
            buildTradeProblemSupportPath(
              {
                order,
                role: 'buyer',
                reason: problemReason,
                remainingMinutes,
              },
              { persist: true },
            );
          }}
        >
          {t('tradeEscalation.problemCta')}
        </Link>
      ) : null}
    </section>
  );
}
