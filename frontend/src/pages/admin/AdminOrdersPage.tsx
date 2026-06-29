import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOrders } from '../../api/admin';
import type { AdminOrderSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatUsdFromMinor } from '../../utils/format';

const ATTENTION_STATUSES = new Set(['DISPUTE', 'WAITING_TRADE', 'TRADE_CONFIRMED']);

function needsAttention(status: string): boolean {
  return ATTENTION_STATUSES.has(status);
}

export function AdminOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    const params =
      statusFilter === 'all' ? undefined : { status: statusFilter };
    getAdminOrders(token, params)
      .then(setOrders)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, statusFilter]);

  const summary = useMemo(
    () => ({
      total: orders.length,
      dispute: orders.filter((order) => order.status === 'DISPUTE').length,
      waitingTrade: orders.filter((order) => order.status === 'WAITING_TRADE').length,
      tradeConfirmed: orders.filter((order) => order.status === 'TRADE_CONFIRMED').length,
    }),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    if (!attentionOnly) {
      return orders;
    }
    return orders.filter((order) => needsAttention(order.status));
  }, [orders, attentionOnly]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Admin orders</h2>
          <p className="muted">Review incidents and resolve disputes.</p>
        </div>
        <div className="stack horizontal">
          <Link to="/admin/lots" className="button secondary">
            Lots
          </Link>
          <Link to="/admin/users" className="button secondary">
            Users
          </Link>
          <Link to="/admin/outbox" className="button secondary">
            Outbox
          </Link>
        </div>
      </div>

      <ErrorAlert error={error} />

      {!loading ? (
        <div className="deals-summary-grid" data-testid="admin-orders-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Orders</span>
            <strong className="seller-summary-count">{summary.total}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Disputes</span>
            <strong className="seller-summary-count">{summary.dispute}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Waiting trade</span>
            <strong className="seller-summary-count">{summary.waitingTrade}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Trade confirmed</span>
            <strong className="seller-summary-count">{summary.tradeConfirmed}</strong>
          </div>
        </div>
      ) : null}

      <div className="card catalog-filters" data-testid="admin-orders-filters">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              data-testid="admin-orders-status-filter"
            >
              <option value="all">All</option>
              <option value="WAITING_TRADE">Waiting trade</option>
              <option value="TRADE_CONFIRMED">Trade confirmed</option>
              <option value="DISPUTE">Dispute</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </label>
          <label className="field catalog-filter-field notifications-unread-toggle">
            <span className="field-label">View</span>
            <select
              value={attentionOnly ? 'attention' : 'all'}
              onChange={(event) => setAttentionOnly(event.target.value === 'attention')}
              data-testid="admin-orders-attention-filter"
            >
              <option value="all">All in filter</option>
              <option value="attention">Needs attention</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? <p className="muted">Loading orders…</p> : null}

      {!loading && filteredOrders.length === 0 ? (
        <p className="muted" data-testid="admin-orders-empty">
          No orders match the current filters.
        </p>
      ) : null}

      <div className="table-wrap">
        <table className="data-table" data-testid="admin-orders-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Status</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                className={needsAttention(order.status) ? 'admin-row-attention' : undefined}
                data-testid={`admin-order-row-${order.status}`}
              >
                <td>{order.lot.inventoryAsset.itemDefinition.marketHashName}</td>
                <td>{order.buyer.username}</td>
                <td>{order.seller.username}</td>
                <td>
                  <span className={`badge badge-${order.status.toLowerCase()}`}>
                    {order.status}
                  </span>
                </td>
                <td>{formatUsdFromMinor(order.amountMinor)}</td>
                <td>
                  <Link to={`/admin/orders/${order.id}`} data-testid={`admin-order-link-${order.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
