import { useState } from 'react';
import type { Order } from '../api/types';
import { ItemPreview } from './ItemPreview';
import { formatTradePollStatus, SELLER_TRADE_INSTRUCTIONS } from '../utils/order-trade';

type OrderTradeSellerPanelProps = {
  order: Order;
  offerInput: string;
  savingOffer: boolean;
  onOfferInputChange: (value: string) => void;
  onSaveTradeReference: () => void;
};

async function copyToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function OrderTradeSellerPanel({
  order,
  offerInput,
  savingOffer,
  onOfferInputChange,
  onSaveTradeReference,
}: OrderTradeSellerPanelProps) {
  const [copied, setCopied] = useState(false);
  const buyerTradeUrl = order.buyer?.tradeUrl?.trim() ?? '';
  const pollStatus = formatTradePollStatus(order.tradeOperation);
  const hasOfferSaved = Boolean(order.tradeOperation?.externalOfferId);

  async function handleCopyBuyerTradeUrl() {
    if (!buyerTradeUrl) {
      return;
    }
    await copyToClipboard(buyerTradeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card order-trade-panel" data-testid="seller-trade-panel">
      <h3 className="order-trade-panel-title">Обмен в Steam — продавец</h3>
      <p className="muted small" data-testid="seller-waiting-message">
        Отправьте trade offer покупателю и укажите ссылку на предложение ниже.
      </p>

      <ItemPreview
        item={order.lot.inventoryAsset}
        title={order.lot.inventoryAsset.itemDefinition.marketHashName}
        size="sm"
        showAttrs
      />

      <div className="order-trade-destination">
        <h4 className="order-trade-subtitle">Куда отправить обмен</h4>
        {buyerTradeUrl ? (
          <div className="order-trade-url-row" data-testid="seller-buyer-trade-url">
            <code className="order-trade-url-value">{buyerTradeUrl}</code>
            <div className="order-trade-url-actions">
              <button
                type="button"
                className="button secondary sm"
                onClick={() => void handleCopyBuyerTradeUrl()}
              >
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
              <a
                className="button secondary sm"
                href={buyerTradeUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть в Steam
              </a>
            </div>
          </div>
        ) : (
          <p className="alert alert-warning" data-testid="seller-buyer-trade-url-missing">
            У покупателя не указан Trade URL в профиле. Попросите его добавить ссылку в
            настройках аккаунта.
          </p>
        )}
      </div>

      <div data-testid="seller-trade-instructions">
        <h4 className="order-trade-subtitle">Инструкция</h4>
        <ol className="order-trade-steps">
          {SELLER_TRADE_INSTRUCTIONS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <p className="order-trade-poll-status" data-testid="trade-poll-status">
        Статус проверки: <strong>{pollStatus}</strong>
      </p>

      {!hasOfferSaved ? (
        <>
          <label className="field">
            <span className="field-label">Ссылка или ID trade offer</span>
            <input
              type="text"
              value={offerInput}
              onChange={(event) => onOfferInputChange(event.target.value)}
              placeholder="https://steamcommunity.com/tradeoffer/…"
              data-testid="trade-offer-input"
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={savingOffer || !offerInput.trim()}
            data-testid="save-trade-offer"
            onClick={onSaveTradeReference}
          >
            {savingOffer ? 'Сохраняем…' : 'Сохранить предложение'}
          </button>
        </>
      ) : (
        <p className="muted small">
          Предложение обмена сохранено:{' '}
          <strong data-testid="trade-offer-id">{order.tradeOperation?.externalOfferId}</strong>
        </p>
      )}
    </div>
  );
}
