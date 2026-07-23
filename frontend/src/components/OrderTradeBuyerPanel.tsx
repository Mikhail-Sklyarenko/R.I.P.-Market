import type { Order } from '../api/types';
import { useLocale } from '../i18n';
import {
  getBuyerTradeSafetyChecklist,
  isOrderTradeDeliveryCheck,
  STEAM_INCOMING_OFFERS_URL,
} from '../utils/order-trade';

type OrderTradeBuyerPanelProps = {
  order: Order;
  checkingDelivery?: boolean;
  acknowledging?: boolean;
  ackEnabled?: boolean;
  extensionMode?: boolean;
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
  extensionMode = false,
  nextActionTitle,
  nextActionDescription,
  onCheckDelivery,
  onAcknowledgePreAccept,
  onAcknowledgeReceived,
}: OrderTradeBuyerPanelProps) {
  const { t, locale } = useLocale();
  const hasOfferSaved = Boolean(order.tradeOperation?.externalOfferId);
  const acks = order.tradeAcknowledgments;
  const isDeliveryCheck = isOrderTradeDeliveryCheck(order);
  const extensionTaskActive =
    extensionMode &&
    order.tradeTask &&
    order.tradeTask.status !== 'EXPIRED' &&
    order.tradeTask.status !== 'FAILED';

  const showPreAccept =
    ackEnabled &&
    order.status === 'WAITING_TRADE' &&
    hasOfferSaved &&
    !acks?.buyerPreAccept &&
    !acks?.buyerReceived &&
    !isDeliveryCheck &&
    Boolean(onAcknowledgePreAccept);

  const showConfirmReceived =
    ackEnabled &&
    hasOfferSaved &&
    !acks?.buyerReceived &&
    Boolean(onAcknowledgeReceived) &&
    (Boolean(acks?.buyerPreAccept) ||
      isDeliveryCheck ||
      order.status === 'TRADE_CONFIRMED' ||
      order.status === 'SETTLEMENT_HOLD');

  const showSteamCta = hasOfferSaved || isDeliveryCheck;
  const showAwaitingSeller = !hasOfferSaved;

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

      {showSteamCta ? (
        <a
          className="button primary"
          href={STEAM_INCOMING_OFFERS_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="buyer-steam-offers-link"
        >
          {t('orderTradePanel.openIncomingOffers')}
        </a>
      ) : null}

      {hasOfferSaved && !isDeliveryCheck ? (
        <details className="order-trade-details" data-testid="buyer-trade-checklist">
          <summary>{t('orderTradePanel.checklistSummary')}</summary>
          <ul className="order-trade-checklist">
            {getBuyerTradeSafetyChecklist(locale).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {(showPreAccept || showConfirmReceived) && !isDeliveryCheck ? (
        <details className="order-trade-details" data-testid="buyer-ack-details">
          <summary>{t('orderTradePanel.ackNotUpdatedSummary')}</summary>
          <p className="muted small">{t('orderTradePanel.ackHint')}</p>
          {showPreAccept ? (
            <div className="extension-seller-cta" data-testid="buyer-ack-preaccept-cta">
              <button
                type="button"
                className="button secondary sm"
                disabled={acknowledging}
                data-testid="buyer-ack-preaccept"
                onClick={onAcknowledgePreAccept}
              >
                {acknowledging ? t('orderTradePanel.saving') : t('orderTradePanel.seePreAccept')}
              </button>
            </div>
          ) : null}
          {showConfirmReceived ? (
            <div className="extension-seller-cta" data-testid="buyer-ack-received-cta">
              <button
                type="button"
                className="button secondary sm"
                disabled={acknowledging}
                data-testid="buyer-ack-received"
                onClick={onAcknowledgeReceived}
              >
                {acknowledging
                  ? t('orderTradePanel.saving')
                  : t('orderTradePanel.itemAlreadyReceived')}
              </button>
            </div>
          ) : null}
        </details>
      ) : null}

      {isDeliveryCheck && showConfirmReceived ? (
        <details className="order-trade-details" data-testid="buyer-ack-details">
          <summary>{t('orderTradePanel.speedUpCheckSummary')}</summary>
          <button
            type="button"
            className="button secondary sm"
            disabled={acknowledging}
            data-testid="buyer-ack-received"
            onClick={onAcknowledgeReceived}
          >
            {acknowledging
              ? t('orderTradePanel.saving')
              : t('orderTradePanel.itemAlreadyReceived')}
          </button>
        </details>
      ) : null}

      {acks?.buyerReceived ? (
        order.status === 'WAITING_TRADE' ? (
          <p className="alert alert-warning" data-testid="buyer-received-ack-pending-steam">
            {t('orderTradePanel.receivedAckPendingSteam')}
          </p>
        ) : (
          <p className="alert alert-success" data-testid="buyer-received-ack">
            {t('orderTradePanel.receivedAck')}
          </p>
        )
      ) : acks?.buyerPreAccept ? (
        <p className="alert alert-success" data-testid="buyer-extension-ack">
          {t('orderTradePanel.extensionAck')}
        </p>
      ) : extensionMode && !ackEnabled ? (
        <p className="muted small" data-testid="buyer-extension-hint">
          {t('orderTradePanel.extensionHintNoAck')}
        </p>
      ) : null}
    </div>
  );
}
