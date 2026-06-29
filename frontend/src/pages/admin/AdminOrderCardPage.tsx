import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminOrderCard, openDispute, resolveDispute, applyObservedStatus, retrySettlement } from '../../api/admin';
import type { AdminOrderCard } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { AdminConfirmModal } from '../../components/AdminConfirmModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatTradeStatus, formatUsdFromMinor, OPEN_DISPUTE_STATUSES } from '../../utils/format';

function walletBalance(
  wallet: AdminOrderCard['order']['buyer']['wallet'],
  type: string,
): string {
  const account = wallet?.accounts.find((item) => item.type === type);
  return account ? formatUsdFromMinor(account.balanceMinor) : '—';
}

export function AdminOrderCardPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [card, setCard] = useState<AdminOrderCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);

  const load = useCallback(() => {
    if (!token || !id) {
      return Promise.resolve();
    }
    return getAdminOrderCard(token, id)
      .then(setCard)
      .catch((err: unknown) => setError(err));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, id, load]);

  async function runAction(
    key: string,
    action: () => Promise<AdminOrderCard>,
    message: string,
  ) {
    if (!reason.trim() || reason.trim().length < 3) {
      setError(new Error('Enter a reason (at least 3 characters).'));
      return;
    }

    setConfirmState({
      title: 'Confirm action',
      message: `Confirm: ${message}?`,
      confirmLabel: 'Confirm',
      action: async () => {
        setActionLoading(key);
        setError(null);
        setSuccessMessage(null);
        try {
          const updated = await action();
          setCard(updated);
          setReason('');
          setSuccessMessage(message);
        } catch (err) {
          setError(err);
        } finally {
          setActionLoading(null);
          setConfirmState(null);
        }
      },
    });
  }

  async function handleRetrySettlement() {
    if (!token || !id) {
      return;
    }
    setConfirmState({
      title: 'Retry settlement',
      message: 'Retry real settlement for this order?',
      confirmLabel: 'Retry settlement',
      action: async () => {
        setActionLoading('retry-settlement');
        setError(null);
        try {
          const updated = await retrySettlement(token, id);
          setCard(updated);
          setSuccessMessage('Settlement retry processed');
        } catch (err) {
          setError(err);
        } finally {
          setActionLoading(null);
          setConfirmState(null);
        }
      },
    });
  }

  async function handleApplyObservedStatus() {
    if (!token || !id) {
      return;
    }
    setConfirmState({
      title: 'Apply observed status',
      message:
        'Apply the latest Steam observed status to this order? Settlement will follow ENABLE_REAL_SETTLEMENT.',
      confirmLabel: 'Apply status',
      action: async () => {
        setActionLoading('apply-observed');
        setError(null);
        setSuccessMessage(null);
        try {
          const updated = await applyObservedStatus(token, id);
          setCard(updated);
          setSuccessMessage('Observed status applied');
        } catch (err) {
          setError(err);
        } finally {
          setActionLoading(null);
          setConfirmState(null);
        }
      },
    });
  }

  async function handleOpenDispute(event: FormEvent) {
    event.preventDefault();
    if (!token || !id) {
      return;
    }
    await runAction('open-dispute', () => openDispute(token, id, reason.trim()), 'Dispute opened');
  }

  async function handleResolve(resolution: 'BUYER' | 'SELLER') {
    if (!token || !id) {
      return;
    }
    const label = resolution === 'BUYER' ? 'Resolved for buyer' : 'Resolved for seller';
    await runAction(
      `resolve-${resolution.toLowerCase()}`,
      () => resolveDispute(token, id, resolution, reason.trim()),
      label,
    );
  }

  const timelineEvents = useMemo(() => {
    if (!card) {
      return [];
    }
    const orderEvents = card.orderStatusEvents.map((event) => ({
      id: `order-${event.id}`,
      label: `Order: ${event.fromStatus ?? '—'} → ${event.toStatus}`,
      reason: event.reason,
      createdAt: event.createdAt,
    }));
    const lotEvents = card.lotStatusEvents.map((event) => ({
      id: `lot-${event.id}`,
      label: `Lot: ${event.fromStatus ?? '—'} → ${event.toStatus}`,
      reason: event.reason,
      createdAt: event.createdAt,
    }));
    return [...orderEvents, ...lotEvents].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  }, [card]);

  if (!id) {
    return null;
  }

  const order = card?.order;
  const canOpenDispute =
    order !== undefined &&
    order.status !== 'DISPUTE' &&
    OPEN_DISPUTE_STATUSES.has(order.status);
  const canResolve = order?.status === 'DISPUTE';
  const isShadowOrder = order?.tradeOperation?.verificationMode === 'SHADOW';
  const latestSteamSnapshot = card?.verificationSnapshots?.find(
    (snapshot) => snapshot.source === 'STEAM_POLL',
  );
  const canApplyObserved =
    isShadowOrder &&
    order?.status === 'WAITING_TRADE' &&
    latestSteamSnapshot !== undefined &&
    ['accepted', 'declined', 'expired', 'timeout'].includes(
      latestSteamSnapshot.observedStatus,
    );

  const canRetrySettlement =
    order?.status === 'TRADE_CONFIRMED' &&
    card?.settlement !== undefined &&
    card.settlement.allowed === false &&
    card.settlement.code !== 'TRADE_NOT_CONFIRMED' &&
    card.settlement.code !== 'ORDER_NOT_TRADE_CONFIRMED';

  function settlementBadge() {
    const settlement = card?.settlement;
    if (!settlement) {
      return null;
    }
    if (settlement.allowed) {
      return (
        <span className="badge badge-completed" data-testid="settlement-eligible">
          Real settlement eligible
        </span>
      );
    }
    if (
      settlement.code === 'TRADE_NOT_CONFIRMED' ||
      settlement.code === 'ORDER_NOT_TRADE_CONFIRMED'
    ) {
      return (
        <span className="badge badge-waiting" data-testid="settlement-pending">
          Awaiting trade confirmation
        </span>
      );
    }
    return (
      <span className="badge badge-dispute" data-testid="settlement-blocked" title={settlement.reason}>
        Settlement blocked
      </span>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Order card</h2>
          <p className="muted">Ops view: parties, ledger, audit, and actions.</p>
        </div>
        <Link to="/admin/orders" className="button secondary">
          All orders
        </Link>
      </div>

      {loading ? <p className="muted">Loading order card…</p> : null}

      {order ? (
        <div className="admin-card" data-testid="admin-order-card">
          <section className="card admin-section">
            <div className="item-card-header">
              <h3>{order.lot.inventoryAsset.itemDefinition.marketHashName}</h3>
              <div className="stack horizontal">
                <span
                  className={`badge badge-${order.status.toLowerCase()}`}
                  data-testid="admin-order-status"
                >
                  {order.status}
                </span>
                {settlementBadge()}
              </div>
            </div>
            {card?.settlement && !card.settlement.allowed ? (
              <p className="muted small" data-testid="settlement-block-reason">
                {card.settlement.reason}
              </p>
            ) : null}
            <dl className="meta-list">
              <div>
                <dt>Order ID</dt>
                <dd>{order.id}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{formatUsdFromMinor(order.amountMinor)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(order.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Lot status</dt>
                <dd>
                  <span className={`badge badge-${order.lot.status.toLowerCase()}`}>
                    {order.lot.status}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="card admin-section">
            <h3>Parties</h3>
            <div className="grid">
              <div>
                <p className="eyebrow">Buyer</p>
                <p>
                  <strong>{order.buyer.username}</strong> ({order.buyer.status})
                </p>
                <p className="muted small">
                  Available: {walletBalance(order.buyer.wallet, 'AVAILABLE')} · Hold:{' '}
                  {walletBalance(order.buyer.wallet, 'HOLD')}
                </p>
              </div>
              <div>
                <p className="eyebrow">Seller</p>
                <p>
                  <strong>{order.seller.username}</strong> ({order.seller.status})
                </p>
                <p className="muted small">
                  Available: {walletBalance(order.seller.wallet, 'AVAILABLE')} · Hold:{' '}
                  {walletBalance(order.seller.wallet, 'HOLD')}
                </p>
              </div>
            </div>
          </section>

          <section className="card admin-section">
            <h3>Trade & hold</h3>
            <dl className="meta-list">
              <div>
                <dt>Trade status</dt>
                <dd>{formatTradeStatus(order.tradeOperation?.status)}</dd>
              </div>
              <div>
                <dt>Offer ID</dt>
                <dd>{order.tradeOperation?.externalOfferId ?? '—'}</dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>{order.tradeOperation?.verificationMode ?? '—'}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>
                  {order.tradeOperation?.lastCheckedAt
                    ? new Date(order.tradeOperation.lastCheckedAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Poll count</dt>
                <dd>{order.tradeOperation?.checkCount ?? 0}</dd>
              </div>
              <div>
                <dt>Provider ref</dt>
                <dd>{order.tradeOperation?.providerRef ?? '—'}</dd>
              </div>
              <div>
                <dt>Fail reason</dt>
                <dd>{order.tradeOperation?.failReasonCode ?? '—'}</dd>
              </div>
              <div>
                <dt>Hold amount</dt>
                <dd>{order.hold ? formatUsdFromMinor(order.hold.amountMinor) : '—'}</dd>
              </div>
              <div>
                <dt>Captured</dt>
                <dd>
                  {order.hold?.capturedMinor
                    ? formatUsdFromMinor(order.hold.capturedMinor)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Released</dt>
                <dd>
                  {order.hold?.releasedMinor
                    ? formatUsdFromMinor(order.hold.releasedMinor)
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          {card?.tradePollEvents && card.tradePollEvents.length > 0 ? (
            <section className="card admin-section">
              <h3>Trade poll history</h3>
              <div className="table-wrap">
                <table className="data-table" data-testid="trade-poll-history">
                  <thead>
                    <tr>
                      <th>Checked</th>
                      <th>Strategy</th>
                      <th>Offer status</th>
                      <th>Outcome</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.tradePollEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{new Date(event.checkedAt).toLocaleString()}</td>
                        <td>{event.strategy ?? '—'}</td>
                        <td>{event.offerStatus ?? '—'}</td>
                        <td>{event.outcome}</td>
                        <td>{event.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {isShadowOrder && card?.verificationSnapshots ? (
            <section className="card admin-section" data-testid="shadow-verification">
              <h3>Shadow verification</h3>
              <div className="table-wrap">
                <table className="data-table" data-testid="shadow-snapshots-table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Source</th>
                      <th>Observed</th>
                      <th>Expected</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.verificationSnapshots.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          No snapshots yet
                        </td>
                      </tr>
                    ) : (
                      card.verificationSnapshots.map((snapshot) => (
                        <tr key={snapshot.id}>
                          <td>{new Date(snapshot.createdAt).toLocaleString()}</td>
                          <td>{snapshot.source}</td>
                          <td>{snapshot.observedStatus}</td>
                          <td>{snapshot.expectedStatus ?? '—'}</td>
                          <td>
                            <span
                              className={`badge ${snapshot.match ? 'badge-completed' : 'badge-dispute'}`}
                              data-testid={`snapshot-match-${snapshot.match ? 'yes' : 'no'}`}
                            >
                              {snapshot.match ? 'Match' : 'Mismatch'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {canApplyObserved ? (
                <button
                  type="button"
                  className="button primary"
                  disabled={actionLoading !== null}
                  data-testid="admin-apply-observed-status"
                  onClick={() => void handleApplyObservedStatus()}
                >
                  {actionLoading === 'apply-observed'
                    ? 'Applying…'
                    : `Apply observed status (${latestSteamSnapshot?.observedStatus})`}
                </button>
              ) : null}
            </section>
          ) : null}

          {card ? (
            <>
              <section className="card admin-section">
                <h3>Ledger</h3>
                <div className="table-wrap">
                  <table className="data-table" data-testid="admin-ledger-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.ledgerEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.type}</td>
                          <td>{formatUsdFromMinor(entry.amountMinor)}</td>
                          <td>{new Date(entry.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card admin-section">
                <h3>Timeline</h3>
                <ul className="simple-list" data-testid="admin-order-timeline">
                  {timelineEvents.map((event) => (
                    <li key={event.id}>
                      {event.label}
                      {event.reason ? ` (${event.reason})` : ''}
                      <span className="muted small">
                        {' '}
                        · {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card admin-section">
                <h3>Audit</h3>
                <div className="table-wrap">
                  <table className="data-table" data-testid="admin-audit-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Reason</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{log.action}</td>
                          <td>
                            {log.entityType}:{log.entityId.slice(0, 8)}…
                          </td>
                          <td>{log.reason ?? '—'}</td>
                          <td>{new Date(log.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card admin-section">
                <h3>Outbox (order)</h3>
                <div className="table-wrap">
                  <table className="data-table" data-testid="admin-outbox-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Status</th>
                        <th>Retries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.outboxEvents.map((event) => (
                        <tr key={event.id} data-testid={`admin-outbox-row-${event.status}`}>
                          <td>{event.eventType}</td>
                          <td>{event.status}</td>
                          <td>{event.retryCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          <section className="card admin-section" data-testid="admin-actions-panel">
            <h3>Actions</h3>
            <label className="field">
              <span>Reason</span>
              <textarea
                className="textarea"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-testid="admin-action-reason"
                rows={3}
                placeholder="Required for dispute actions"
              />
            </label>

            {canRetrySettlement ? (
              <button
                type="button"
                className="button secondary"
                disabled={actionLoading !== null}
                data-testid="admin-retry-settlement"
                onClick={() => void handleRetrySettlement()}
              >
                {actionLoading === 'retry-settlement' ? 'Retrying…' : 'Retry settlement'}
              </button>
            ) : null}

            {canOpenDispute ? (
              <form onSubmit={(event) => void handleOpenDispute(event)}>
                <button
                  type="submit"
                  className="button secondary"
                  disabled={actionLoading !== null}
                  data-testid="admin-open-dispute"
                >
                  {actionLoading === 'open-dispute' ? 'Opening…' : 'Open dispute'}
                </button>
              </form>
            ) : null}

            {canResolve ? (
              <div className="stack">
                <button
                  type="button"
                  className="button primary"
                  disabled={actionLoading !== null}
                  data-testid="admin-resolve-buyer"
                  onClick={() => void handleResolve('BUYER')}
                >
                  {actionLoading === 'resolve-buyer' ? 'Resolving…' : 'Resolve for buyer'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={actionLoading !== null}
                  data-testid="admin-resolve-seller"
                  onClick={() => void handleResolve('SELLER')}
                >
                  {actionLoading === 'resolve-seller' ? 'Resolving…' : 'Resolve for seller'}
                </button>
              </div>
            ) : null}

            {successMessage ? (
              <p className="success-text" data-testid="admin-action-success">
                {successMessage}
              </p>
            ) : null}
          </section>

          <ErrorAlert error={error} />
        </div>
      ) : null}

      <AdminConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? 'Confirm'}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        loading={actionLoading !== null}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            void confirmState.action();
          }
        }}
      />
    </div>
  );
}
