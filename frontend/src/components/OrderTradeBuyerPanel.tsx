import type { Order } from '../api/types';
import {
  BUYER_TRADE_SAFETY_CHECKLIST,
  STEAM_INCOMING_OFFERS_URL,
} from '../utils/order-trade';

type OrderTradeBuyerPanelProps = {
  order: Order;
  extensionMode?: boolean;
  nextActionTitle?: string;
  nextActionDescription?: string;
};

export function OrderTradeBuyerPanel({
  order,
  extensionMode = false,
  nextActionTitle,
  nextActionDescription,
}: OrderTradeBuyerPanelProps) {
  const hasOfferSaved = Boolean(order.tradeOperation?.externalOfferId);
  const extensionTaskActive =
    extensionMode &&
    order.tradeTask &&
    order.tradeTask.status !== 'EXPIRED' &&
    order.tradeTask.status !== 'FAILED';

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
