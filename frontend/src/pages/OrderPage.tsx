import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { acknowledgeOrderTrade, cancelOrder, checkOrderDelivery, getAuthConfig, getOrder, mockTradeSuccess, updateOrderTradeReference } from '../api/marketplace';
import { mockTradeFail, mockTradeTimeout } from '../api/admin';
import { getSettlementEligibility } from '../api/settlement';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { OrderStepper } from '../components/OrderStepper';
import { OrderTradeBuyerPanel } from '../components/OrderTradeBuyerPanel';
import { OrderTradeSellerPanel } from '../components/OrderTradeSellerPanel';
import { CopyableDealId } from '../components/CopyableDealId';
import { ExtensionConnectPanel } from '../components/ExtensionConnectPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { WearBar } from '../components/WearBar';
import {
  BUYER_CANCELABLE_STATUSES,
  canShowDevPanels,
  MOCK_TRADE_ENABLED,
} from '../utils/format';
import { formatOrderRoleLabel } from '../utils/my-orders';
import {
  formatTradePollStatus,
  getTradeTimeoutRemainingMinutes,
} from '../utils/order-trade';
import { formatOrderStatus, getOrderNextAction } from '../utils/order-flow';
import {
  formatExtensionUiTradeFlowLabel,
  requestExtensionPoll,
} from '../utils/extension';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
} from '../utils/item-image';

const POLL_STATUSES = new Set(['WAITING_TRADE', 'TRADE_CONFIRMED', 'PAYMENT_RESERVED', 'CREATED']);

export function OrderPage() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const { token, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [mockTradeEnabled, setMockTradeEnabled] = useState(MOCK_TRADE_ENABLED);
  const [tradeProvider, setTradeProvider] = useState<'mock' | 'steam'>('mock');
  const [tradeTimeoutMinutes, setTradeTimeoutMinutes] = useState(60);
  const [enableRealSettlement, setEnableRealSettlement] = useState(false);
  const [liveVerificationMode, setLiveVerificationMode] = useState(false);
  const [extensionTaskPipeline, setExtensionTaskPipeline] = useState(false);
  const [extensionUiTradeFlow, setExtensionUiTradeFlow] = useState(false);
  const [extensionTradeAckEnabled, setExtensionTradeAckEnabled] = useState(false);
  const [settlementBanner, setSettlementBanner] = useState(false);
  const [offerInput, setOfferInput] = useState('');
  const [savingOffer, setSavingOffer] = useState(false);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [deliveryCheckMessage, setDeliveryCheckMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [failing, setFailing] = useState<'SAFE' | 'DISPUTE' | 'TIMEOUT' | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [timeoutRemainingMinutes, setTimeoutRemainingMinutes] = useState<number | null>(null);

  const isBuyer = user?.id === order?.buyerId;
  const isSeller = user?.id === order?.sellerId;
  const role = isBuyer ? 'buyer' : isSeller ? 'seller' : 'other';
  const canBuyerCancel =
    isBuyer && order !== null && BUYER_CANCELABLE_STATUSES.has(order.status);
  const mockBlockedByLiveSettlement =
    enableRealSettlement && liveVerificationMode && user?.role !== 'ADMIN';
  const showMockTradePanel =
    order?.status === 'WAITING_TRADE' &&
    mockTradeEnabled &&
    !mockBlockedByLiveSettlement &&
    canShowDevPanels(user?.role) &&
    (user?.role === 'ADMIN' || (MOCK_TRADE_ENABLED && isBuyer && tradeProvider === 'mock'));
  const nextAction = order ? getOrderNextAction(order, role, locale) : null;
  const showTradePanels = order?.status === 'WAITING_TRADE';

  const load = useCallback(() => {
    if (!token || !id) {
      return Promise.resolve();
    }
    return getOrder(token, id)
      .then(setOrder)
      .catch((err: unknown) => setError(err));
  }, [token, id]);

  useEffect(() => {
    getAuthConfig()
      .then((config) => {
        setMockTradeEnabled(config.mockTradeEnabled && MOCK_TRADE_ENABLED);
        setTradeProvider(config.tradeProvider);
        setEnableRealSettlement(config.enableRealSettlement);
        setLiveVerificationMode(config.liveVerificationMode);
        setExtensionTaskPipeline(
          Boolean(config.extension?.extensionTaskPipelineEnabled),
        );
        setExtensionUiTradeFlow(
          Boolean(config.extension?.extensionUiTradeFlowEnabled),
        );
        setExtensionTradeAckEnabled(
          Boolean(config.extension?.extensionTradeAcknowledgmentEnabled),
        );
        setTradeTimeoutMinutes(config.tradeTimeoutMinutes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    getSettlementEligibility(token)
      .then((eligibility) => setSettlementBanner(eligibility.bannerVisible))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !id) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, id, load]);

  useEffect(() => {
    if (!order || !POLL_STATUSES.has(order.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [order, load]);

  useEffect(() => {
    if (!order || !showTradePanels) {
      setTimeoutRemainingMinutes(null);
      return;
    }

    const updateTimeout = () => {
      setTimeoutRemainingMinutes(
        getTradeTimeoutRemainingMinutes(order.createdAt, tradeTimeoutMinutes),
      );
    };

    updateTimeout();
    const timer = window.setInterval(updateTimeout, 60_000);
    return () => window.clearInterval(timer);
  }, [order, showTradePanels, tradeTimeoutMinutes]);

  useEffect(() => {
    if (!isSeller || !showTradePanels || !order?.tradeTask) {
      return;
    }
    const phase = order.tradeTask.executionPhase;
    if (phase === 'OFFER_SENT' || phase === 'CONFIRM_PENDING') {
      return;
    }
    void requestExtensionPoll();
    const timer = window.setInterval(() => {
      void requestExtensionPoll();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [isSeller, showTradePanels, order?.tradeTask?.id, order?.tradeTask?.executionPhase]);

  async function handleSaveTradeReference() {
    if (!token || !order || !offerInput.trim()) {
      return;
    }
    setSavingOffer(true);
    setError(null);
    try {
      const updated = await updateOrderTradeReference(token, order.id, {
        tradeUrl: offerInput.trim(),
      });
      setOrder(updated);
      setOfferInput('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleCheckDelivery() {
    if (!token || !order) {
      return;
    }
    setCheckingDelivery(true);
    setError(null);
    setDeliveryCheckMessage(null);
    try {
      const result = await checkOrderDelivery(token, order.id);
      setOrder(result.order);
      setDeliveryCheckMessage(
        result.transitioned
          ? t('orderPage.deliveryConfirmed')
          : t('orderPage.deliveryCheckDone'),
      );
    } catch (err) {
      setError(err);
    } finally {
      setCheckingDelivery(false);
    }
  }

  async function handleAcknowledge(
    type: 'SELLER_ACK_SENT' | 'BUYER_ACK_PRE_ACCEPT' | 'BUYER_ACK_RECEIVED',
  ) {
    if (!token || !order) {
      return;
    }
    setAcknowledging(true);
    setError(null);
    try {
      const result = await acknowledgeOrderTrade(token, order.id, type);
      setOrder(result.order);
    } catch (err) {
      setError(err);
    } finally {
      setAcknowledging(false);
    }
  }

  async function handleMockSuccess() {
    if (!token || !order) {
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const updated = await mockTradeSuccess(token, order.id);
      setOrder(updated);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setCompleting(false);
    }
  }

  async function handleMockFail(mode: 'SAFE' | 'DISPUTE') {
    if (!token || !order) {
      return;
    }
    setFailing(mode);
    setError(null);
    try {
      const updated = await mockTradeFail(token, order.id, mode);
      setOrder(updated);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setFailing(null);
    }
  }

  async function handleMockTimeout() {
    if (!token || !order) {
      return;
    }
    setFailing('TIMEOUT');
    setError(null);
    try {
      const updated = await mockTradeTimeout(token, order.id);
      setOrder(updated);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setFailing(null);
    }
  }

  async function handleCancel() {
    if (!token || !order) {
      return;
    }
    setCanceling(true);
    setError(null);
    try {
      const updated = await cancelOrder(token, order.id);
      setOrder(updated);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setCanceling(false);
    }
  }

  if (!id) {
    return null;
  }

  const asset = order?.lot.inventoryAsset;
  const floatText = asset ? formatFloatValue(asset.floatValue) : null;
  const patternText = asset ? formatPaintSeed(asset.paintSeed) : null;
  const category = asset ? getItemCategory(asset) : null;
  const wear = asset?.wear ?? null;

  return (
    <div className="page order-page">
      <PageHeader
        title={t('orderPage.title')}
        subtitle={
          isSeller
            ? t('orderPage.subtitleSeller')
            : t('orderPage.subtitleBuyer')
        }
        actions={
          <Link to="/deals?tab=sales" className="button secondary">
            {t('orderPage.myDeals')}
          </Link>
        }
      />

      {loading ? <LoadingState message={t('orderPage.loading')} /> : null}

      {settlementBanner ? (
        <div className="card notice-banner" data-testid="real-settlement-banner">
          {t('orderPage.realSettlementBanner')}
        </div>
      ) : null}

      {order ? (
        <div className="order-page-grid" data-testid="order-page">
          <div className="order-page-main">
            <div className="card order-item-card">
              {asset ? (
                <>
                  <ItemPreview
                    item={asset}
                    title={asset.itemDefinition.marketHashName}
                    size="lg"
                    showAttrs={false}
                  />
                  <p className="order-item-links">
                    <Link
                      to={
                        (asset.itemDefinitionId ?? asset.itemDefinition.id)
                          ? `/catalog/items/${
                              asset.itemDefinitionId ?? asset.itemDefinition.id
                            }`
                          : `/lots/${order.lotId}`
                      }
                      className="button secondary sm"
                      data-testid="order-open-item-page"
                    >
                      {t('orderPage.itemPageLink')}
                    </Link>
                    <Link
                      to={`/lots/${order.lotId}`}
                      className="button ghost sm"
                      data-testid="order-open-lot-page"
                    >
                      {t('orderPage.lotLink')}
                    </Link>
                  </p>
                  {asset.floatValue !== null &&
                  asset.floatValue !== undefined &&
                  asset.floatValue !== '' ? (
                    <WearBar floatValue={asset.floatValue} />
                  ) : null}
                  <dl className="lot-attrs-grid meta-list">
                    {category ? (
                      <div>
                        <dt>{t('orderPage.category')}</dt>
                        <dd>{category}</dd>
                      </div>
                    ) : null}
                    {wear ? (
                      <div>
                        <dt>{t('orderPage.wear')}</dt>
                        <dd>{wear}</dd>
                      </div>
                    ) : null}
                    {floatText ? (
                      <div>
                        <dt>{t('orderPage.floatLabel')}</dt>
                        <dd>{floatText}</dd>
                      </div>
                    ) : null}
                    {patternText ? (
                      <div>
                        <dt>Pattern</dt>
                        <dd>{patternText}</dd>
                      </div>
                    ) : null}
                  </dl>
                </>
              ) : null}
            </div>

            <div className="card order-progress-card">
              <OrderStepper status={order.status} />
            </div>

            {order.statusEvents && order.statusEvents.length > 0 ? (
              <details className="order-timeline-details">
                <summary className="order-timeline-summary">{t('orderPage.statusHistory')}</summary>
                <div className="order-timeline" data-testid="order-timeline">
                  <ul className="simple-list">
                    {order.statusEvents.map((event) => (
                      <li key={event.id}>
                        <strong>{formatOrderStatus(event.toStatus, locale)}</strong>
                        <span className="muted small">
                          {' '}
                          ·{' '}
                          {new Date(event.createdAt).toLocaleString(
                            locale === 'en' ? 'en-US' : 'ru-RU',
                          )}
                        </span>
                        {event.reason ? (
                          <span className="muted small"> · {event.reason}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
          </div>

          <aside className="order-page-sidebar">
            <div className="card order-action-card">
              <div className="order-action-header">
                <StatusBadge
                  status={order.status}
                  label={formatOrderStatus(order.status, locale)}
                  compact
                />
                <span data-testid="order-status" className="sr-only">
                  {order.status}
                </span>
              </div>

              <CopyableDealId id={order.id} testId="order-deal-id" />

              <p className="muted small order-support-link">
                <Link to="/support">{t('orderPage.supportLink')}</Link>
                {t('orderPage.supportLinkSuffix')}
              </p>

              {showTradePanels && timeoutRemainingMinutes !== null ? (
                <p className="order-trade-timeout" data-testid="order-trade-timeout">
                  {timeoutRemainingMinutes > 0
                    ? t('orderPage.timeoutRemaining', { minutes: timeoutRemainingMinutes })
                    : t('orderPage.timeoutExpired')}
                </p>
              ) : null}

              {nextAction && !showTradePanels ? (
                <div className="next-action-card" data-testid="order-next-action">
                  <strong>{nextAction.title}</strong>
                  <p className="muted small">{nextAction.description}</p>
                </div>
              ) : null}

              {isSeller && showTradePanels && extensionTaskPipeline && token ? (
                <ExtensionConnectPanel token={token} compact />
              ) : null}

              {showTradePanels &&
              extensionTaskPipeline &&
              canShowDevPanels(user?.role) ? (
                <p className="muted small" data-testid="extension-ui-trade-hint">
                  {t('orderPage.extensionTradeModeLabel')}{' '}
                  {formatExtensionUiTradeFlowLabel(extensionUiTradeFlow, locale)}
                </p>
              ) : null}

              {deliveryCheckMessage ? (
                <p className="alert alert-success" data-testid="delivery-check-result">
                  {deliveryCheckMessage}
                </p>
              ) : null}

              {isSeller && showTradePanels ? (
                <OrderTradeSellerPanel
                  order={order}
                  offerInput={offerInput}
                  savingOffer={savingOffer}
                  checkingDelivery={checkingDelivery}
                  acknowledging={acknowledging}
                  ackEnabled={extensionTradeAckEnabled}
                  extensionMode={extensionTaskPipeline && Boolean(order.tradeTask)}
                  nextActionTitle={nextAction?.title}
                  nextActionDescription={nextAction?.description}
                  onOfferInputChange={setOfferInput}
                  onSaveTradeReference={() => void handleSaveTradeReference()}
                  onCheckDelivery={() => void handleCheckDelivery()}
                  onAcknowledgeSent={() => void handleAcknowledge('SELLER_ACK_SENT')}
                />
              ) : null}

              {isBuyer && showTradePanels ? (
                <OrderTradeBuyerPanel
                  order={order}
                  checkingDelivery={checkingDelivery}
                  acknowledging={acknowledging}
                  ackEnabled={extensionTradeAckEnabled}
                  extensionMode={extensionTaskPipeline && Boolean(order.tradeTask)}
                  nextActionTitle={nextAction?.title}
                  nextActionDescription={nextAction?.description}
                  onCheckDelivery={() => void handleCheckDelivery()}
                  onAcknowledgePreAccept={() =>
                    void handleAcknowledge('BUYER_ACK_PRE_ACCEPT')
                  }
                  onAcknowledgeReceived={() =>
                    void handleAcknowledge('BUYER_ACK_RECEIVED')
                  }
                />
              ) : null}

              <div className="order-money-summary" data-testid="order-money-block">
                <div className="order-money-row">
                  <span>{t('orderPage.amount')}</span>
                  <MoneyDisplay minor={order.amountMinor} strong />
                </div>
                <div className="order-money-row">
                  <span>{t('orderPage.onHold')}</span>
                  <MoneyDisplay
                    minor={order.hold?.amountMinor ?? order.holdAmountMinor}
                    strong
                  />
                </div>
                <div className="order-money-row order-money-meta">
                  <span>{t('orderPage.role')}</span>
                  <strong data-testid="order-role">
                    {formatOrderRoleLabel(
                      isBuyer ? 'buyer' : isSeller ? 'seller' : 'other',
                      locale,
                    )}
                  </strong>
                </div>
                <div className="order-money-row order-money-meta">
                  <span>{t('orderPage.trade')}</span>
                  <strong data-testid="trade-operation-status">
                    {formatTradePollStatus(order.tradeOperation, locale)}
                  </strong>
                </div>
                {order.tradeOperation?.externalOfferId ? (
                  <div className="order-money-row order-money-meta">
                    <span>{t('orderPage.offerId')}</span>
                    <strong data-testid="trade-offer-id-summary">
                      {order.tradeOperation.externalOfferId}
                    </strong>
                  </div>
                ) : null}
              </div>

              {showMockTradePanel ? (
                <div className="dev-panel" data-testid="mock-trade-panel">
                  <p className="muted small">{t('orderPage.devSimulateHint')}</p>
                  <div className="stack">
                    <button
                      type="button"
                      className="button primary"
                      disabled={completing || failing !== null}
                      data-testid="mock-trade-success"
                      onClick={() => void handleMockSuccess()}
                    >
                      {completing ? t('orderPage.completing') : t('orderPage.completeTradeMock')}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={completing || failing !== null}
                      data-testid="mock-trade-fail-safe"
                      onClick={() => void handleMockFail('SAFE')}
                    >
                      {failing === 'SAFE' ? t('orderPage.failing') : t('orderPage.failTradeSafe')}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={completing || failing !== null}
                      data-testid="mock-trade-fail-dispute"
                      onClick={() => void handleMockFail('DISPUTE')}
                    >
                      {failing === 'DISPUTE'
                        ? t('orderPage.failing')
                        : t('orderPage.failTradeDispute')}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={completing || failing !== null}
                      data-testid="mock-trade-timeout"
                      onClick={() => void handleMockTimeout()}
                    >
                      {failing === 'TIMEOUT'
                        ? t('orderPage.timingOut')
                        : t('orderPage.tradeTimeoutDispute')}
                    </button>
                  </div>
                </div>
              ) : null}

              {canBuyerCancel ? (
                <div className="stack" data-testid="cancel-order-panel">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={canceling}
                    data-testid="cancel-order-button"
                    onClick={() => void handleCancel()}
                  >
                    {canceling ? t('orderPage.canceling') : t('orderPage.cancelOrder')}
                  </button>
                </div>
              ) : null}

              {order.status === 'FAILED' ? (
                <p className="muted small" data-testid="order-failed-message">
                  {t('orderPage.failedMessage')}
                </p>
              ) : null}

              {order.status === 'DISPUTE' ? (
                <p className="muted small" data-testid="order-dispute-message">
                  {t('orderPage.disputeMessage')}
                </p>
              ) : null}

              {order.status === 'COMPLETED' ? (
                <p className="success-text" data-testid="order-completed-message">
                  {t('orderPage.completedMessage')}
                </p>
              ) : null}

              {order.status === 'CANCELED' ? (
                <p className="muted small" data-testid="order-canceled-message">
                  {t('orderPage.canceledMessage')}
                </p>
              ) : null}

              <ErrorAlert error={error} />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
