import { useState } from 'react';
import type { Order } from '../api/types';
import { useLocale } from '../i18n';
import { ExtensionTaskProgress } from './ExtensionTaskProgress';
import { ItemPreview } from './ItemPreview';
import {
  formatTradePollStatus,
  getSellerTradeInstructions,
  isOrderTradeDeliveryCheck,
} from '../utils/order-trade';

type OrderTradeSellerPanelProps = {
  order: Order;
  offerInput: string;
  savingOffer: boolean;
  checkingDelivery?: boolean;
  acknowledging?: boolean;
  ackEnabled?: boolean;
  extensionMode?: boolean;
  nextActionTitle?: string;
  nextActionDescription?: string;
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
  nextActionTitle,
  nextActionDescription,
  onOfferInputChange,
  onSaveTradeReference,
  onCheckDelivery,
  onAcknowledgeSent,
}: OrderTradeSellerPanelProps) {
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const buyerTradeUrl = order.buyer?.tradeUrl?.trim() ?? '';
  const pollStatus = formatTradePollStatus(order.tradeOperation, locale);
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
      <h3 className="order-trade-panel-title">{t('orderTradePanel.yourStep')}</h3>

      {nextActionTitle ? (
        <div className="next-action-card" data-testid="order-next-action">
          <strong>{nextActionTitle}</strong>
          {nextActionDescription ? (
            <p className="muted small">{nextActionDescription}</p>
          ) : null}
        </div>
      ) : null}

      {extensionMode && extensionHandling && isConfirmPending ? (
        <div className="extension-seller-cta" data-testid="seller-extension-guard-cta">
          <strong>{t('orderTradePanel.confirmGuardTitle')}</strong>
          <p className="muted small">{t('orderTradePanel.confirmGuardBody')}</p>
        </div>
      ) : null}

      {isDeliveryCheck ? (
        <div className="alert alert-info" data-testid="seller-delivery-check-banner">
          <strong>{t('orderTradePanel.checkingDeliveryTitle')}</strong>
          <p className="muted small">{t('orderTradePanel.checkingDeliveryBody')}</p>
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

      {sellerAckSent && !isDeliveryCheck ? (
        <p className="alert alert-success" data-testid="seller-ack-sent-done">
          {t('orderTradePanel.ackSentDone')}
        </p>
      ) : null}

      {extensionMode ? (
        <ExtensionTaskProgress
          tradeTask={order.tradeTask}
          manualFallbackVisible={showManualForm}
          itemMarketHashName={itemMarketHashName}
        />
      ) : (
        <p className="muted small" data-testid="seller-waiting-message">
          {t('orderTradePanel.waitingMessage')}
        </p>
      )}

      <ItemPreview
        item={order.lot.inventoryAsset}
        title={order.lot.inventoryAsset.itemDefinition.marketHashName}
        size="sm"
        showAttrs
      />

      {(showSellerAck || showManualForm || buyerTradeUrl) && !isDeliveryCheck ? (
        <details
          className="order-trade-details"
          data-testid="seller-trade-details"
          open={!extensionHandling && showManualForm}
        >
          <summary>
            {extensionHandling
              ? t('orderTradePanel.detailsExtraSummary')
              : t('orderTradePanel.detailsManualSummary')}
          </summary>

          {showSellerAck ? (
            <div className="extension-seller-cta" data-testid="seller-ack-sent-cta">
              <p className="muted small">{t('orderTradePanel.guardConfirmedHint')}</p>
              <button
                type="button"
                className="button secondary sm"
                disabled={acknowledging}
                data-testid="seller-ack-sent"
                onClick={onAcknowledgeSent}
              >
                {acknowledging ? t('orderTradePanel.saving') : t('orderTradePanel.iSentTrade')}
              </button>
            </div>
          ) : null}

          <div className="order-trade-destination">
            <h4 className="order-trade-subtitle">{t('orderTradePanel.buyerTradeUrlTitle')}</h4>
            {buyerTradeUrl ? (
              <div className="order-trade-url-row" data-testid="seller-buyer-trade-url">
                <code className="order-trade-url-value">{buyerTradeUrl}</code>
                <div className="order-trade-url-actions">
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => void handleCopyBuyerTradeUrl()}
                  >
                    {copied ? t('orderTradePanel.copied') : t('orderTradePanel.copy')}
                  </button>
                  <a
                    className="button secondary sm"
                    href={buyerTradeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('orderTradePanel.openInSteam')}
                  </a>
                </div>
              </div>
            ) : (
              <p className="alert alert-warning" data-testid="seller-buyer-trade-url-missing">
                {t('orderTradePanel.buyerTradeUrlMissing')}
              </p>
            )}
          </div>

          {!extensionHandling ? (
            <div data-testid="seller-trade-instructions">
              <h4 className="order-trade-subtitle">{t('orderTradePanel.instructionsTitle')}</h4>
              <ol className="order-trade-steps">
                {getSellerTradeInstructions(locale).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {!hasOfferSaved && showManualForm ? (
            <>
              <label className="field">
                <span className="field-label">{t('orderTradePanel.tradeOfferInputLabel')}</span>
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
                {savingOffer ? t('orderTradePanel.savingTrade') : t('orderTradePanel.saveOffer')}
              </button>
            </>
          ) : hasOfferSaved ? (
            <p className="muted small">
              {t('orderTradePanel.offerLabel')}{' '}
              <strong data-testid="trade-offer-id">
                {order.tradeOperation?.externalOfferId}
              </strong>
            </p>
          ) : null}
        </details>
      ) : hasOfferSaved ? (
        <p className="muted small">
          {t('orderTradePanel.offerLabel')}{' '}
          <strong data-testid="trade-offer-id">{order.tradeOperation?.externalOfferId}</strong>
        </p>
      ) : null}

      <p className="order-trade-poll-status" data-testid="trade-poll-status">
        {t('orderTradePanel.pollStatusLabel')} <strong>{pollStatus}</strong>
      </p>
    </div>
  );
}
