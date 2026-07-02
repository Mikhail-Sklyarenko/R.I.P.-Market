import type { Order } from '../api/types';
import {
  BUYER_TRADE_SAFETY_CHECKLIST,
  STEAM_INCOMING_OFFERS_URL,
} from '../utils/order-trade';

type OrderTradeBuyerPanelProps = {
  order: Order;
  nextActionTitle?: string;
  nextActionDescription?: string;
};

export function OrderTradeBuyerPanel({
  order,
  nextActionTitle,
  nextActionDescription,
}: OrderTradeBuyerPanelProps) {
  const awaitingSellerOffer = !order.tradeOperation?.externalOfferId;

  return (
    <div className="card order-trade-panel" data-testid="buyer-trade-panel">
      <h3 className="order-trade-panel-title">Обмен в Steam — покупатель</h3>

      {nextActionTitle ? (
        <div className="next-action-card" data-testid="order-next-action">
          <strong>{nextActionTitle}</strong>
          {nextActionDescription ? (
            <p className="muted small">{nextActionDescription}</p>
          ) : null}
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

      {awaitingSellerOffer ? (
        <p className="muted small" data-testid="buyer-awaiting-offer-message">
          Ожидаем, пока продавец отправит обмен и укажет ссылку на trade offer.
        </p>
      ) : (
        <p className="muted small">
          Продавец указал trade offer. Примите обмен в Steam — статус обновится автоматически.
        </p>
      )}
    </div>
  );
}
