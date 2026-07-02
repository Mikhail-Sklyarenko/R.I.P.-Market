import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelOrder, getAuthConfig, getOrder, mockTradeSuccess, updateOrderTradeReference } from '../api/marketplace';
import { mockTradeFail, mockTradeTimeout } from '../api/admin';
import { getSettlementEligibility } from '../api/settlement';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { OrderStepper } from '../components/OrderStepper';
import { OrderTradeBuyerPanel } from '../components/OrderTradeBuyerPanel';
import { OrderTradeSellerPanel } from '../components/OrderTradeSellerPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
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
import { formatLotStatus } from '../utils/seller-flow';

const POLL_STATUSES = new Set(['WAITING_TRADE', 'TRADE_CONFIRMED', 'PAYMENT_RESERVED', 'CREATED']);

export function OrderPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [mockTradeEnabled, setMockTradeEnabled] = useState(MOCK_TRADE_ENABLED);
  const [tradeProvider, setTradeProvider] = useState<'mock' | 'steam'>('mock');
  const [tradeTimeoutMinutes, setTradeTimeoutMinutes] = useState(60);
  const [enableRealSettlement, setEnableRealSettlement] = useState(false);
  const [liveVerificationMode, setLiveVerificationMode] = useState(false);
  const [settlementBanner, setSettlementBanner] = useState(false);
  const [offerInput, setOfferInput] = useState('');
  const [savingOffer, setSavingOffer] = useState(false);
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
  const nextAction = order ? getOrderNextAction(order, role) : null;
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

  return (
    <div className="page">
      <PageHeader
        title="Сделка"
        subtitle={
          isSeller
            ? 'Отслеживайте продажу и обмен в Steam.'
            : 'Отслеживайте покупку и статус обмена.'
        }
        actions={
          <Link to="/my/orders" className="button secondary">
            Мои сделки
          </Link>
        }
      />

      {loading ? <LoadingState message="Загрузка сделки…" /> : null}

      {settlementBanner ? (
        <div className="card notice-banner" data-testid="real-settlement-banner">
          На этом окружении для вашего Steam-аккаунта включён реальный расчёт после обмена.
        </div>
      ) : null}

      {order ? (
        <div className="stack order-page-stack" data-testid="order-page">
          <div className="card form-card">
            <div className="order-page-header">
              <ItemPreview
                item={order.lot.inventoryAsset}
                title={order.lot.inventoryAsset.itemDefinition.marketHashName}
                size="sm"
                showAttrs
              />
              <div className="order-page-header-meta">
                <div className="order-status-wrap">
                  <StatusBadge status={order.status} label={formatOrderStatus(order.status)} />
                  <span data-testid="order-status" className="sr-only">
                    {order.status}
                  </span>
                </div>
              </div>
            </div>

            <OrderStepper status={order.status} />

            {showTradePanels && timeoutRemainingMinutes !== null ? (
              <p className="order-trade-timeout" data-testid="order-trade-timeout">
                {timeoutRemainingMinutes > 0
                  ? `Осталось ~${timeoutRemainingMinutes} мин. до автоматического спора при отсутствии обмена.`
                  : 'Время на обмен истекло — скоро может быть открыт спор.'}
              </p>
            ) : null}

            {nextAction && !showTradePanels ? (
              <div className="next-action-card" data-testid="order-next-action">
                <strong>{nextAction.title}</strong>
                <p className="muted small">{nextAction.description}</p>
              </div>
            ) : null}

            {isSeller && showTradePanels ? (
              <OrderTradeSellerPanel
                order={order}
                offerInput={offerInput}
                savingOffer={savingOffer}
                onOfferInputChange={setOfferInput}
                onSaveTradeReference={() => void handleSaveTradeReference()}
              />
            ) : null}

            {isBuyer && showTradePanels ? (
              <OrderTradeBuyerPanel
                order={order}
                nextActionTitle={nextAction?.title}
                nextActionDescription={nextAction?.description}
              />
            ) : null}

            <div className="pricing-preview" data-testid="order-money-block">
              <div>
                <span>Сумма сделки</span>
                <MoneyDisplay minor={order.amountMinor} strong />
              </div>
              <div>
                <span>На hold</span>
                <MoneyDisplay
                  minor={order.hold?.amountMinor ?? order.holdAmountMinor}
                  strong
                />
              </div>
              <div>
                <span>Ваша роль</span>
                <strong data-testid="order-role">
                  {formatOrderRoleLabel(isBuyer ? 'buyer' : isSeller ? 'seller' : 'other')}
                </strong>
              </div>
              <div>
                <span>Статус обмена</span>
                <strong data-testid="trade-operation-status">
                  {formatTradePollStatus(order.tradeOperation)}
                </strong>
              </div>
              {order.tradeOperation?.externalOfferId ? (
                <div>
                  <span>ID trade offer</span>
                  <strong data-testid="trade-offer-id-summary">
                    {order.tradeOperation.externalOfferId}
                  </strong>
                </div>
              ) : null}
              <div>
                <span>Статус лота</span>
                <strong>{formatLotStatus(order.lot.status)}</strong>
              </div>
            </div>

            {order.statusEvents && order.statusEvents.length > 0 ? (
              <div className="order-timeline" data-testid="order-timeline">
                <h4 className="eyebrow">История статусов</h4>
                <ul className="simple-list">
                  {order.statusEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{formatOrderStatus(event.toStatus)}</strong>
                      <span className="muted small">
                        {' '}
                        · {new Date(event.createdAt).toLocaleString('ru-RU')}
                      </span>
                      {event.reason ? (
                        <span className="muted small"> · {event.reason}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showMockTradePanel ? (
              <div className="dev-panel" data-testid="mock-trade-panel">
                <p className="muted small">Dev/stage: simulate trade outcomes.</p>
                <div className="stack">
                  <button
                    type="button"
                    className="button primary"
                    disabled={completing || failing !== null}
                    data-testid="mock-trade-success"
                    onClick={() => void handleMockSuccess()}
                  >
                    {completing ? 'Completing…' : 'Complete trade (mock)'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={completing || failing !== null}
                    data-testid="mock-trade-fail-safe"
                    onClick={() => void handleMockFail('SAFE')}
                  >
                    {failing === 'SAFE' ? 'Failing…' : 'Fail trade (safe)'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={completing || failing !== null}
                    data-testid="mock-trade-fail-dispute"
                    onClick={() => void handleMockFail('DISPUTE')}
                  >
                    {failing === 'DISPUTE' ? 'Failing…' : 'Fail trade (dispute)'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={completing || failing !== null}
                    data-testid="mock-trade-timeout"
                    onClick={() => void handleMockTimeout()}
                  >
                    {failing === 'TIMEOUT' ? 'Timing out…' : 'Trade timeout (dispute)'}
                  </button>
                </div>
              </div>
            ) : null}

            {canBuyerCancel ? (
              <div className="stack" data-testid="cancel-order-panel">
                <p className="muted small">
                  Отмените до завершения обмена — средства вернутся, лот снова в каталоге.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={canceling}
                  data-testid="cancel-order-button"
                  onClick={() => void handleCancel()}
                >
                  {canceling ? 'Отменяем…' : 'Отменить сделку'}
                </button>
              </div>
            ) : null}

            {order.status === 'FAILED' ? (
              <p className="muted" data-testid="order-failed-message">
                Сделка не состоялась. Средства возвращены при необходимости.
              </p>
            ) : null}

            {order.status === 'DISPUTE' ? (
              <p className="muted" data-testid="order-dispute-message">
                Открыт спор. Команда поддержки рассмотрит ситуацию.
              </p>
            ) : null}

            {order.status === 'COMPLETED' ? (
              <p className="success-text" data-testid="order-completed-message">
                Сделка успешно завершена.
              </p>
            ) : null}

            {order.status === 'CANCELED' ? (
              <p className="muted" data-testid="order-canceled-message">
                Сделка отменена. Средства возвращены при необходимости.
              </p>
            ) : null}

            <ErrorAlert error={error} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
