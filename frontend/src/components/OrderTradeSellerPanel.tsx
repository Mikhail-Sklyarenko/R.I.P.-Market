import { useState } from 'react';
import type { Order } from '../api/types';
import { ExtensionTaskProgress } from './ExtensionTaskProgress';
import { ItemPreview } from './ItemPreview';
import {
  formatTradePollStatus,
  isOrderTradeDeliveryCheck,
  SELLER_TRADE_INSTRUCTIONS,
} from '../utils/order-trade';

type OrderTradeSellerPanelProps = {
  order: Order;
  offerInput: string;
  savingOffer: boolean;
  checkingDelivery?: boolean;
  acknowledging?: boolean;
  ackEnabled?: boolean;
  extensionMode?: boolean;
  onOfferInputChange: (value: string) => void;
  onSaveTradeReference: () => void;
  onCheckDelivery?: () => void;
  onAcknowledgeSent?: () => void;
};

async function copyToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function OrderTradeSellerPanel({
  order,
  offerInput,
  savingOffer,
  checkingDelivery = false,
  acknowledging = false,
  ackEnabled = false,
  extensionMode = false,
  onOfferInputChange,
  onSaveTradeReference,
  onCheckDelivery,
  onAcknowledgeSent,
}: OrderTradeSellerPanelProps) {
  const [copied, setCopied] = useState(false);
  const buyerTradeUrl = order.buyer?.tradeUrl?.trim() ?? '';
  const pollStatus = formatTradePollStatus(order.tradeOperation);
  const hasOfferSaved = Boolean(order.tradeOperation?.externalOfferId);
  const tradeTask = order.tradeTask;
  const isConfirmPending = tradeTask?.executionPhase === 'CONFIRM_PENDING';
  const isDeliveryCheck = isOrderTradeDeliveryCheck(order);
  const sellerAckSent = Boolean(order.tradeAcknowledgments?.sellerAckSent);
  const showSellerAck =
    ackEnabled &&
    order.status === 'WAITING_TRADE' &&
    hasOfferSaved &&
    !sellerAckSent &&
    !isDeliveryCheck &&
    Boolean(onAcknowledgeSent);
  const extensionHandling =
    extensionMode &&
    tradeTask &&
    tradeTask.status !== 'EXPIRED' &&
    tradeTask.status !== 'FAILED' &&
    tradeTask.executionPhase !== 'OFFER_FAILED';
  const showManualForm = (!extensionHandling || !hasOfferSaved) && !isDeliveryCheck;
  const itemMarketHashName =
    order.lot.inventoryAsset.itemDefinition.marketHashName ?? null;

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

      {extensionMode && extensionHandling && isConfirmPending ? (
        <div className="extension-seller-cta" data-testid="seller-extension-guard-cta">
          <strong>Осталось подтвердить Guard</strong>
          <p className="muted small">
            Расширение уже создало обмен. Откройте Steam Mobile и подтвердите отправку.
          </p>
        </div>
      ) : null}

      {isDeliveryCheck ? (
        <div className="alert alert-info" data-testid="seller-delivery-check-banner">
          <strong>Проверяем доставку</strong>
          <p className="muted small">
            Предмет уже не найден у продавца в Steam. Не отправляйте новый trade offer —
            платформа сверяет инвентарь покупателя.
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

      {showSellerAck ? (
        <div className="extension-seller-cta" data-testid="seller-ack-sent-cta">
          <strong>Подтвердите отправку</strong>
          <p className="muted small">
            Если Guard уже подтверждён — нажмите ниже. Это не переводит деньги, а сообщает
            покупателю и ускоряет согласование сделки.
          </p>
          <button
            type="button"
            className="button primary sm"
            disabled={acknowledging}
            data-testid="seller-ack-sent"
            onClick={onAcknowledgeSent}
          >
            {acknowledging ? 'Сохраняем…' : 'Я отправил обмен'}
          </button>
        </div>
      ) : null}

      {sellerAckSent && !isDeliveryCheck ? (
        <p className="alert alert-success" data-testid="seller-ack-sent-done">
          Вы подтвердили отправку. Ожидаем принятия покупателем в Steam.
        </p>
      ) : null}

      <p className="muted small" data-testid="seller-waiting-message">
        {isDeliveryCheck
          ? 'Статус сделки обновится автоматически после проверки доставки.'
          : extensionMode
            ? extensionHandling && !isConfirmPending
              ? 'Расширение добавит предмет в trade offer автоматически. Вам останется подтвердить обмен в Steam Guard, если потребуется.'
              : 'Расширение отправит trade offer автоматически. Подтвердите в Steam Guard при необходимости.'
            : 'Отправьте trade offer покупателю и укажите ссылку на предложение ниже.'}
      </p>

      {extensionMode ? (
        <ExtensionTaskProgress
          tradeTask={order.tradeTask}
          manualFallbackVisible={showManualForm}
          itemMarketHashName={itemMarketHashName}
        />
      ) : null}

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

      {!hasOfferSaved && showManualForm ? (
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
