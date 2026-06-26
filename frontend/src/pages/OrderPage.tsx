import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelOrder, getAuthConfig, getOrder, mockTradeSuccess, updateOrderTradeReference } from '../api/marketplace';
import { mockTradeFail, mockTradeTimeout } from '../api/admin';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import {
  BUYER_CANCELABLE_STATUSES,
  formatTradeStatus,
  formatUsdFromMinor,
  MOCK_TRADE_ENABLED,
} from '../utils/format';

const POLL_STATUSES = new Set(['WAITING_TRADE', 'TRADE_CONFIRMED', 'PAYMENT_RESERVED', 'CREATED']);

export function OrderPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [mockTradeEnabled, setMockTradeEnabled] = useState(MOCK_TRADE_ENABLED);
  const [tradeProvider, setTradeProvider] = useState<'mock' | 'steam'>('mock');
  const [offerInput, setOfferInput] = useState('');
  const [savingOffer, setSavingOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [failing, setFailing] = useState<'SAFE' | 'DISPUTE' | 'TIMEOUT' | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const isBuyer = user?.id === order?.buyerId;
  const isSeller = user?.id === order?.sellerId;
  const canBuyerCancel =
    isBuyer && order !== null && BUYER_CANCELABLE_STATUSES.has(order.status);

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
      })
      .catch(() => undefined);
  }, []);

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
      <div className="page-header">
        <div>
          <h2>Order</h2>
          <p className="muted">
            {isSeller
              ? 'Track sale progress for your listing.'
              : 'Track purchase status and trade progress.'}
          </p>
        </div>
        <Link to="/my/orders" className="button secondary">
          My orders
        </Link>
      </div>

      {loading ? <p className="muted">Loading order…</p> : null}

      {order ? (
        <div className="card form-card" data-testid="order-page">
          <div className="item-card-header">
            <h3>{order.lot.inventoryAsset.itemDefinition.marketHashName}</h3>
            <span className={`badge badge-${order.status.toLowerCase()}`} data-testid="order-status">
              {order.status}
            </span>
          </div>

          <div className="pricing-preview">
            <div>
              <span>Amount</span>
              <strong>{formatUsdFromMinor(order.amountMinor)}</strong>
            </div>
            <div>
              <span>Your role</span>
              <strong data-testid="order-role">
                {isBuyer ? 'Buyer' : isSeller ? 'Seller' : '—'}
              </strong>
            </div>
            <div>
              <span>Trade status</span>
              <strong data-testid="trade-operation-status">
                {formatTradeStatus(order.tradeOperation?.status)}
              </strong>
            </div>
            {order.tradeOperation?.externalOfferId ? (
              <div>
                <span>Trade offer ID</span>
                <strong data-testid="trade-offer-id">
                  {order.tradeOperation.externalOfferId}
                </strong>
              </div>
            ) : null}
            {order.tradeOperation?.lastCheckedAt ? (
              <div>
                <span>Last checked</span>
                <strong>
                  {new Date(order.tradeOperation.lastCheckedAt).toLocaleString()}
                </strong>
              </div>
            ) : null}
            <div>
              <span>Lot status</span>
              <strong>{order.lot.status}</strong>
            </div>
          </div>

          {isSeller && order.status === 'WAITING_TRADE' ? (
            <div className="stack" data-testid="seller-trade-panel">
              <p className="muted">
                Send the trade offer in Steam, then paste the trade offer ID or URL below.
              </p>
              {order.seller?.tradeUrl ? (
                <p className="muted small">
                  Your Steam trade URL:{' '}
                  <a href={order.seller.tradeUrl} target="_blank" rel="noreferrer">
                    Open Steam trade
                  </a>
                </p>
              ) : null}
              {!order.tradeOperation?.externalOfferId ? (
                <>
                  <label className="field">
                    <span>Trade offer ID or URL</span>
                    <input
                      type="text"
                      value={offerInput}
                      onChange={(event) => setOfferInput(event.target.value)}
                      placeholder="https://steamcommunity.com/tradeoffer/…"
                      data-testid="trade-offer-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={savingOffer || !offerInput.trim()}
                    data-testid="save-trade-offer"
                    onClick={() => void handleSaveTradeReference()}
                  >
                    {savingOffer ? 'Saving…' : 'Save trade offer'}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {isBuyer && order.status === 'WAITING_TRADE' && tradeProvider === 'mock' && mockTradeEnabled ? (
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
                Cancel before trade completes to release funds and reopen the listing.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={canceling}
                data-testid="cancel-order-button"
                onClick={() => void handleCancel()}
              >
                {canceling ? 'Canceling…' : 'Cancel order'}
              </button>
            </div>
          ) : null}

          {order.status === 'FAILED' ? (
            <p className="muted" data-testid="order-failed-message">
              Order failed. Funds were released if applicable.
            </p>
          ) : null}

          {order.status === 'DISPUTE' ? (
            <p className="muted" data-testid="order-dispute-message">
              Dispute opened. Ops will review and resolve.
            </p>
          ) : null}

          {order.status === 'COMPLETED' ? (
            <p className="success-text" data-testid="order-completed-message">
              Deal completed successfully.
            </p>
          ) : null}

          {order.status === 'CANCELED' ? (
            <p className="muted" data-testid="order-canceled-message">
              Order was canceled. Funds were released if applicable.
            </p>
          ) : null}

          <ErrorAlert error={error} />
        </div>
      ) : null}
    </div>
  );
}
