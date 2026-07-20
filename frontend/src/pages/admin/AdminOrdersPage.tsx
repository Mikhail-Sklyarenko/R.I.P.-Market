import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOrders } from '../../api/admin';
import type { AdminOrderSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
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
      <PageHeader
        title="Заказы"
        subtitle="Инциденты, споры и статусы сделок."
      />

      <ErrorAlert error={error} />

      {!loading ? (
        <div className="deals-summary-grid" data-testid="admin-orders-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Всего</span>
            <strong className="seller-summary-count">{summary.total}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Споры</span>
            <strong className="seller-summary-count">{summary.dispute}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Ожидают трейд</span>
            <strong className="seller-summary-count">{summary.waitingTrade}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Трейд подтверждён</span>
            <strong className="seller-summary-count">{summary.tradeConfirmed}</strong>
          </div>
        </div>
      ) : null}

      <div className="card catalog-filters" data-testid="admin-orders-filters">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">Статус</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              data-testid="admin-orders-status-filter"
            >
              <option value="all">Все</option>
              <option value="WAITING_TRADE">Waiting trade</option>
              <option value="TRADE_CONFIRMED">Trade confirmed</option>
              <option value="DISPUTE">Dispute</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </label>
          <label className="field catalog-filter-field notifications-unread-toggle">
            <span className="field-label">Вид</span>
            <select
              value={attentionOnly ? 'attention' : 'all'}
              onChange={(event) => setAttentionOnly(event.target.value === 'attention')}
              data-testid="admin-orders-attention-filter"
            >
              <option value="all">Все в фильтре</option>
              <option value="attention">Требуют внимания</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? <LoadingState message="Загрузка заказов…" /> : null}

      {!loading && filteredOrders.length === 0 ? (
        <EmptyState
          title="Заказов нет"
          message="Нет заказов по текущим фильтрам."
        />
      ) : null}

      {!loading && filteredOrders.length > 0 ? (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table" data-testid="admin-orders-table">
              <thead>
                <tr>
                  <th>Предмет</th>
                  <th>Покупатель</th>
                  <th>Продавец</th>
                  <th>Статус</th>
                  <th>Сумма</th>
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
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="button secondary sm"
                        data-testid={`admin-order-link-${order.id}`}
                      >
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
