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

  return (
    <div className="card order-trade-panel" data-testid="buyer-trade-panel">
      <h3 className="order-trade-panel-title">Обмен в Steam — покупатель</h3>

      {isDeliveryCheck ? (
        <div className="alert alert-info" data-testid="buyer-delivery-check-banner">
          <strong>Проверьте предмет в Steam</strong>
          <p className="muted small">
            Обмен мог уже пройти. Откройте инвентарь или входящие предложения Steam и
            убедитесь, что скин на месте — платформа подтвердит сделку автоматически.
          </p>
          <div className="stack horizontal" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
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
            {showConfirmReceived ? (
              <button
                type="button"
                className="button primary sm"
                disabled={acknowledging}
                data-testid="buyer-ack-received"
                onClick={onAcknowledgeReceived}
              >
                {acknowledging ? 'Сохраняем…' : 'Предмет получен'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {nextActionTitle ? (
        <div className="next-action-card" data-testid="order-next-action">
          <strong>{nextActionTitle}</strong>
          {nextActionDescription ? (
            <p className="muted small">{nextActionDescription}</p>
          ) : null}
        </div>
      ) : null}

      {showPreAccept ? (
        <div className="extension-seller-cta" data-testid="buyer-ack-preaccept-cta">
          <strong>Видите предложение в Steam?</strong>
          <p className="muted small">
            Проверьте скин и нажмите ниже, затем примите exchange в Steam. Это не переводит
            деньги — только ускоряет проверку на платформе.
          </p>
          <button
            type="button"
            className="button primary sm"
            disabled={acknowledging}
            data-testid="buyer-ack-preaccept"
            onClick={onAcknowledgePreAccept}
          >
            {acknowledging ? 'Сохраняем…' : 'Вижу предложение'}
          </button>
        </div>
      ) : null}

      {!isDeliveryCheck && showConfirmReceived ? (
        <div className="extension-seller-cta" data-testid="buyer-ack-received-cta">
          <strong>Предмет уже у вас?</strong>
          <p className="muted small">
            После принятия в Steam подтвердите получение — платформа быстрее сверит инвентарь.
          </p>
          <button
            type="button"
            className="button primary sm"
            disabled={acknowledging}
            data-testid="buyer-ack-received"
            onClick={onAcknowledgeReceived}
          >
            {acknowledging ? 'Сохраняем…' : 'Предмет получен'}
          </button>
        </div>
      ) : null}

      <a
        className="button secondary"
        href={STEAM_INCOMING_OFFERS_URL}
        target="_blank"
        rel="noreferrer"
        data-testid="buyer-steam-offers-link"
      >
        Открыть входящие предложения Steam
      </a>

      <div data-testid="buyer-trade-checklist">
        <h4 className="order-trade-subtitle">Проверьте перед принятием</h4>
        <ul className="order-trade-checklist">
          {BUYER_TRADE_SAFETY_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {acks?.buyerReceived ? (
        <p className="alert alert-success" data-testid="buyer-received-ack">
          Вы подтвердили получение предмета в R.I.P Market.
        </p>
      ) : acks?.buyerPreAccept ? (
        <p className="alert alert-success" data-testid="buyer-extension-ack">
          Вы подтвердили, что видите предложение. Примите обмен в Steam.
        </p>
      ) : extensionMode && !ackEnabled ? (
        <p className="muted small" data-testid="buyer-extension-hint">
          Установите расширение R.I.P Market — на странице обмена в Steam вы увидите
          проверку сделки перед принятием.
        </p>
      ) : null}

      {!hasOfferSaved && extensionTaskActive ? (
        <p className="muted small" data-testid="buyer-awaiting-offer-message">
          Продавец отправляет предмет через расширение. Обычно это занимает 1–2 минуты —
          мы обновим страницу автоматически.
        </p>
      ) : !hasOfferSaved ? (
        <p className="muted small" data-testid="buyer-awaiting-offer-message">
          Ожидаем, пока продавец отправит обмен и укажет ссылку на trade offer.
        </p>
      ) : (
        <p className="muted small" data-testid="buyer-accept-offer-message">
          Продавец отправил обмен. Примите trade offer в Steam и проверьте, что предмет
          совпадает с заказом.
        </p>
      )}
    </div>
  );
}
