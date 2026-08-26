import type { Order } from '../api/types';
import { useLocale } from '../i18n';
import { TradeCounterpartyCard } from './TradeCounterpartyCard';
import { BuyerAcceptWizard } from './BuyerAcceptWizard';
import {
  getBuyerTradeSafetyChecklist,
  isOrderTradeDeliveryCheck,
  STEAM_INCOMING_OFFERS_URL,
} from '../utils/order-trade';
import {
  buildSteamTradeOfferUrl,
  resolveBuyerScenarioAck,
} from '../utils/buyer-accept-wizard';

type OrderTradeBuyerPanelProps = {
  order: Order;
  checkingDelivery?: boolean;
  acknowledging?: boolean;
  ackEnabled?: boolean;
  /** I5: guided buyer wizard; unset/true = show when other conditions met. */
  guidedBuyerEnabled?: boolean;
  extensionMode?: boolean;
  extensionConnected?: boolean;
  remainingMinutes?: number | null;
  nextActionTitle?: string;
  nextActionDescription?: string;
  onCheckDelivery?: () => void;
  onAcknowledgePreAccept?: () => void;
  onAcknowledgeReceived?: () => void;
};

export function OrderTradeBuyerPanel({
  order,
  checkingDelivery = false,
  acknowledging = false,
  ackEnabled = false,
  guidedBuyerEnabled = true,
  extensionMode = false,
  extensionConnected = false,
  remainingMinutes = null,
  nextActionTitle,
  nextActionDescription,
  onCheckDelivery,
  onAcknowledgePreAccept,
  onAcknowledgeReceived,
}: OrderTradeBuyerPanelProps) {
  const { t, locale } = useLocale();
  const hasOfferSaved = Boolean(order.tradeOperation?.externalOfferId);
  const steamOfferUrl = buildSteamTradeOfferUrl(
    order.tradeOperation?.externalOfferId,
  );
  const acks = order.tradeAcknowledgments;
  const isDeliveryCheck = isOrderTradeDeliveryCheck(order);
  const extensionTaskActive =
    extensionMode &&
    order.tradeTask &&
    order.tradeTask.status !== 'EXPIRED' &&
    order.tradeTask.status !== 'FAILED';
  const showAcceptWizard =
    guidedBuyerEnabled &&
    hasOfferSaved &&
    !isDeliveryCheck &&
    order.status === 'WAITING_TRADE';

  const scenarioAck = resolveBuyerScenarioAck({
    order,
    ackEnabled,
    blockedByMismatch: order.tradeVerification?.status === 'mismatch',
  });

  // Delivery-check path: received ack is primary here (wizard hidden).
  const showDeliveryReceivedAck =
    isDeliveryCheck &&
    scenarioAck.showReceived &&
    Boolean(onAcknowledgeReceived);

  const showSteamCta = (hasOfferSaved || isDeliveryCheck) && !showAcceptWizard;
  const showAwaitingSeller = !hasOfferSaved;
  const steamCtaHref =
    steamOfferUrl && hasOfferSaved ? steamOfferUrl : STEAM_INCOMING_OFFERS_URL;
  const steamCtaLabel = steamOfferUrl
    ? t('orderTradePanel.openVerifiedOffer')
    : t('orderTradePanel.openIncomingOffers');

  return (
    <div className="card order-trade-panel" data-testid="buyer-trade-panel">
      <h3 className="order-trade-panel-title">{t('orderTradePanel.yourStep')}</h3>

      {nextActionTitle ? (
        <div className="next-action-card" data-testid="order-next-action">
          <strong>{nextActionTitle}</strong>
          {nextActionDescription ? (
            <p className="muted small">{nextActionDescription}</p>
          ) : null}
        </div>
      ) : null}

      {order.seller ? (
        <TradeCounterpartyCard
          party={order.seller}
          role="seller"
          showScamWarning={showSteamCta || showAwaitingSeller || showAcceptWizard}
        />
      ) : null}

      {isDeliveryCheck ? (
        <div className="alert alert-info" data-testid="buyer-delivery-check-banner">
          <strong>{t('orderTradePanel.checkItemTitle')}</strong>
          <p className="muted small">{t('orderTradePanel.checkItemBody')}</p>
          {onCheckDelivery ? (
            <button
              type="button"
              className="button secondary sm"
              disabled={checkingDelivery}
              data-testid="check-delivery-now"
              onClick={onCheckDelivery}
            >
              {checkingDelivery ? t('orderTradePanel.checking') : t('orderTradePanel.checkNow')}
            </button>
          ) : null}
        </div>
      ) : null}

      {showAwaitingSeller ? (
        <p className="muted small" data-testid="buyer-awaiting-offer-message">
          {extensionTaskActive
            ? t('orderTradePanel.awaitingExtension')
            : t('orderTradePanel.awaitingSeller')}
        </p>
      ) : null}

      {showAcceptWizard ? (
        <BuyerAcceptWizard
          order={order}
          extensionConnected={extensionConnected}
          ackEnabled={ackEnabled}
          acknowledging={acknowledging}
          remainingMinutes={remainingMinutes}
          onAcknowledgePreAccept={onAcknowledgePreAccept}
          onAcknowledgeReceived={onAcknowledgeReceived}
        />
      ) : null}

      {showSteamCta ? (
        <a
          className="button primary"
          href={steamCtaHref}
          target="_blank"
          rel="noreferrer"
          data-testid="buyer-steam-offers-link"
        >
          {steamCtaLabel}
        </a>
      ) : null}

      {showDeliveryReceivedAck ? (
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

      {hasOfferSaved && !isDeliveryCheck && !showAcceptWizard ? (
        <details className="order-trade-details" data-testid="buyer-trade-checklist">
          <summary>{t('orderTradePanel.checklistSummary')}</summary>
          <ul className="order-trade-checklist">
            {getBuyerTradeSafetyChecklist(locale).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {!showAcceptWizard && acks?.buyerReceived ? (
        order.status === 'WAITING_TRADE' ? (
          <p className="alert alert-warning" data-testid="buyer-received-ack-pending-steam">
            {t('orderTradePanel.receivedAckPendingSteam')}
          </p>
        ) : (
          <p className="alert alert-success" data-testid="buyer-received-ack">
            {t('orderTradePanel.receivedAck')}
          </p>
        )
      ) : null}

      {!showAcceptWizard &&
      !acks?.buyerReceived &&
      acks?.buyerPreAccept ? (
        <p className="alert alert-success" data-testid="buyer-extension-ack">
          {t('orderTradePanel.extensionAck')}
        </p>
      ) : null}

      {!showAcceptWizard && extensionMode && !ackEnabled ? (
        <p className="muted small" data-testid="buyer-extension-hint">
          {t('orderTradePanel.extensionHintNoAck')}
        </p>
      ) : null}
    </div>
  );
}
