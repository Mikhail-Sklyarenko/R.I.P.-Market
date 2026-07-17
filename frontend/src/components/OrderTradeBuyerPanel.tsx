import type { Order } from '../api/types';
import {
  BUYER_TRADE_SAFETY_CHECKLIST,
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
      <h3 className="order-trade-panel-title">Ваш шаг</h3>

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
          <strong>Проверьте предмет в Steam</strong>
          <p className="muted small">
            Обмен мог уже пройти. Откройте инвентарь Steam — платформа подтвердит сделку
            сама.
          </p>
          {onCheckDelivery ? (
            <button
              type="button"
              className="button secondary sm"
              disabled={checkingDelivery}
              data-testid="check-delivery-now"
              onClick={onCheckDelivery}
            >
              {checkingDelivery ? 'Проверяем…' : 'Проверить доставку сейчас'}
            </button>
          ) : null}
        </div>
      ) : null}

      {showAwaitingSeller ? (
        <p className="muted small" data-testid="buyer-awaiting-offer-message">
          {extensionTaskActive
            ? 'Продавец отправляет обмен через расширение. Обычно 1–2 минуты — страница обновится сама.'
            : 'Ждём, пока продавец отправит обмен в Steam.'}
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
          Открыть входящие предложения Steam
        </a>
      ) : null}

      {hasOfferSaved && !isDeliveryCheck ? (
        <details className="order-trade-details" data-testid="buyer-trade-checklist">
          <summary>Перед принятием проверьте скин</summary>
          <ul className="order-trade-checklist">
            {BUYER_TRADE_SAFETY_CHECKLIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {(showPreAccept || showConfirmReceived) && !isDeliveryCheck ? (
        <details className="order-trade-details" data-testid="buyer-ack-details">
          <summary>Если статус на сайте не обновился</summary>
          <p className="muted small">
            Эти кнопки не заменяют принятие обмена в Steam — только помогают сайту
            быстрее сверить статус.
          </p>
          {showPreAccept ? (
            <div className="extension-seller-cta" data-testid="buyer-ack-preaccept-cta">
              <button
                type="button"
                className="button secondary sm"
                disabled={acknowledging}
                data-testid="buyer-ack-preaccept"
                onClick={onAcknowledgePreAccept}
              >
                {acknowledging ? 'Сохраняем…' : 'Вижу предложение в Steam'}
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
                {acknowledging ? 'Сохраняем…' : 'Предмет уже у меня в Steam'}
              </button>
            </div>
          ) : null}
        </details>
      ) : null}

      {isDeliveryCheck && showConfirmReceived ? (
        <details className="order-trade-details" data-testid="buyer-ack-details">
          <summary>Ускорить проверку</summary>
          <button
            type="button"
            className="button secondary sm"
            disabled={acknowledging}
            data-testid="buyer-ack-received"
            onClick={onAcknowledgeReceived}
          >
            {acknowledging ? 'Сохраняем…' : 'Предмет уже у меня в Steam'}
          </button>
        </details>
      ) : null}

      {acks?.buyerReceived ? (
        order.status === 'WAITING_TRADE' ? (
          <p className="alert alert-warning" data-testid="buyer-received-ack-pending-steam">
            На сайте отметка есть, но скин ещё не виден у вас в Steam. Примите входящий
            trade offer — статус обновится сам.
          </p>
        ) : (
          <p className="alert alert-success" data-testid="buyer-received-ack">
            Получение отмечено. Если скин уже в Steam — сделка скоро закроется.
          </p>
        )
      ) : acks?.buyerPreAccept ? (
        <p className="alert alert-success" data-testid="buyer-extension-ack">
          Ок. Осталось принять обмен в Steam.
        </p>
      ) : extensionMode && !ackEnabled ? (
        <p className="muted small" data-testid="buyer-extension-hint">
          С расширением R.I.P Market на странице обмена в Steam будет проверка сделки.
        </p>
      ) : null}
    </div>
  );
}
