import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listMyOrders } from '../api/marketplace';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CopyableDealId } from '../components/CopyableDealId';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { OrderItemLink } from '../components/OrderItemLink';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { formatOrderStatusCompact } from '../utils/order-flow';
import {
  computeSellerPendingReceiveMinor,
  filterOrders,
  formatOrderRoleLabel,
  getOrderRole,
  getOrderSummaryCounts,
  isActiveOrderStatus,
  type OrderRoleFilter,
  type OrderStatusFilter,
} from '../utils/my-orders';
import { resolveDisplayIconUrl } from '../utils/item-image';

type MyOrdersPageProps = {
  embedded?: boolean;
  sellerOnly?: boolean;
  buyerOnly?: boolean;
  emptyStateMode?: 'purchases' | 'sales' | 'default';
};

export function MyOrdersPage({
  embedded = false,
  sellerOnly = false,
  buyerOnly = false,
  emptyStateMode = 'default',
}: MyOrdersPageProps) {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { summary: walletSummary } = useWalletSummary();
  const [summaryOrders, setSummaryOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [roleFilter, setRoleFilter] = useState<OrderRoleFilter>(
    sellerOnly ? 'seller' : buyerOnly ? 'buyer' : 'all',
  );
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');

  const apiParams = useMemo(() => {
    const role = roleFilter === 'all' ? undefined : roleFilter;
    const status =
      statusFilter === 'waiting'
        ? 'WAITING_TRADE'
        : statusFilter === 'completed'
          ? 'COMPLETED'
          : statusFilter === 'review'
            ? 'DISPUTE'
            : undefined;
    return { role, status };
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    if (!token) {
      return;
    }
    listMyOrders(token)
      .then(setSummaryOrders)
      .catch((err: unknown) => setError(err));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    listMyOrders(token, apiParams)
      .then((data) => {
        if (statusFilter === 'active') {
          setOrders(data.filter((order) => isActiveOrderStatus(order.status)));
          return;
        }
        setOrders(data);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, apiParams, statusFilter]);

  const summary = useMemo(
    () => getOrderSummaryCounts(summaryOrders),
    [summaryOrders],
  );

  const pendingReceiveMinor = useMemo(
    () => computeSellerPendingReceiveMinor(summaryOrders, user?.id),
    [summaryOrders, user?.id],
  );

  const filteredOrders = useMemo(
    () => filterOrders(orders, user?.id, 'all', 'all'),
    [orders, user?.id],
  );

  return (
    <div className={embedded ? 'seller-activity-panel' : 'page'}>
      {!embedded ? (
        <PageHeader
          title="Мои сделки"
          subtitle="Покупки и продажи в одном списке."
        />
      ) : null}

      <ErrorAlert error={error} />

      {!embedded && walletSummary ? (
        <div
          className="wallet-balance-grid my-orders-wallet-summary"
          data-testid="my-orders-wallet-summary"
        >
          <div className="card wallet-balance-card" data-testid="my-orders-available">
            <span className="eyebrow">Доступно</span>
            <MoneyDisplay minor={walletSummary.availableMinor} strong />
          </div>
          <div className="card wallet-balance-card" data-testid="my-orders-hold">
            <span className="eyebrow">В hold</span>
            <MoneyDisplay minor={walletSummary.holdMinor} strong />
          </div>
          {pendingReceiveMinor > 0 ? (
            <div
              className="card wallet-balance-card"
              data-testid="my-orders-pending-receive"
            >
              <span className="eyebrow">К получению</span>
              <MoneyDisplay minor={pendingReceiveMinor} strong />
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <LoadingState message="Загрузка сделок…" /> : null}

      {!loading && summaryOrders.length > 0 ? (
        <div className="deals-summary-grid" data-testid="my-orders-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Активные</span>
            <strong className="seller-summary-count">{summary.active}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Ожидают передачи</span>
            <strong className="seller-summary-count">{summary.waitingTrade}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Завершены</span>
            <strong className="seller-summary-count">{summary.completed}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">На проверке</span>
            <strong className="seller-summary-count">{summary.review}</strong>
          </div>
        </div>
      ) : null}

      {!loading && orders.length > 0 ? (
        <div className="card deals-filters" data-testid="my-orders-filters">
          <div className="catalog-filters-row">
            {!sellerOnly && !buyerOnly ? (
              <label className="field catalog-filter-field">
                <span className="field-label">Роль</span>
                <select
                  value={roleFilter}
                  onChange={(event) =>
                    setRoleFilter(event.target.value as OrderRoleFilter)
                  }
                  data-testid="my-orders-role-filter"
                >
                  <option value="all">Все</option>
                  <option value="buyer">Покупатель</option>
                  <option value="seller">Продавец</option>
                </select>
              </label>
            ) : null}
            <label className="field catalog-filter-field">
              <span className="field-label">Статус</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as OrderStatusFilter)
                }
                data-testid="my-orders-status-filter"
              >
                <option value="all">Все</option>
                <option value="active">Активные</option>
                <option value="waiting">Ожидают передачи</option>
                <option value="completed">Завершены</option>
                <option value="review">На проверке</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {!loading && orders.length === 0 ? (
        <EmptyState
          title={
            emptyStateMode === 'purchases'
              ? 'Покупок пока нет'
              : emptyStateMode === 'sales'
                ? 'Продаж пока нет'
                : 'Сделок пока нет'
          }
          message={
            emptyStateMode === 'purchases'
              ? 'Выберите лот в каталоге и оформите первую покупку.'
              : emptyStateMode === 'sales'
                ? 'Выставьте предмет из инвентаря, чтобы начать продавать.'
                : 'Купите лот в каталоге или выставьте предмет на продажу.'
          }
          action={
            emptyStateMode === 'purchases' ? (
              <Link to="/catalog" className="button primary">
                В каталог
              </Link>
            ) : emptyStateMode === 'sales' ? (
              <Link to="/sell/inventory" className="button primary">
                В инвентарь
              </Link>
            ) : (
              <Link to="/catalog" className="button primary">
                В каталог
              </Link>
            )
          }
        />
      ) : null}

      {filteredOrders.length > 0 ? (
        <div className="table-wrap deals-orders-table-wrap">
          <table className="data-table deals-orders-table" data-testid="my-orders-table">
            <thead>
              <tr>
                <th>Предмет</th>
                {!sellerOnly && !buyerOnly ? <th>Роль</th> : null}
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const role = getOrderRole(order, user?.id);
                const itemName =
                  order.lot.inventoryAsset.itemDefinition.marketHashName;
                const orderHref = `/orders/${order.id}`;

                function openOrder(event?: MouseEvent) {
                  // Let real links (item) / middle-click work without double navigation.
                  if (
                    event &&
                    (event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey)
                  ) {
                    return;
                  }
                  const target = event?.target as HTMLElement | undefined;
                  if (target?.closest('a, button')) {
                    return;
                  }
                  navigate(orderHref);
                }

                return (
                  <tr
                    key={order.id}
                    className="deals-order-row"
                    data-testid={`order-row-${order.status}`}
                    tabIndex={0}
                    onClick={openOrder}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(orderHref);
                      }
                    }}
                  >
                    <td>
                      <OrderItemLink
                        href={orderHref}
                        name={itemName}
                        iconUrl={resolveDisplayIconUrl(
                          order.lot.listingSnapshot?.iconUrl,
                          order.lot.inventoryAsset.itemDefinition.iconUrl,
                        )}
                        compact
                        testId={`open-order-${order.id}`}
                      />
                    </td>
                    {!sellerOnly && !buyerOnly ? (
                      <td>
                        <span className="deals-role-label">
                          {formatOrderRoleLabel(role)}
                        </span>
                      </td>
                    ) : null}
                    <td className="deals-amount-cell">
                      <MoneyDisplay
                        minor={
                          role === 'seller'
                            ? order.lot.sellerReceiveMinor
                            : order.amountMinor
                        }
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={order.status}
                        label={formatOrderStatusCompact(order.status)}
                        compact
                      />
                      <span className="sr-only">{order.status}</span>
                    </td>
                    <td className="deals-date-cell">
                      {new Date(order.createdAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="deals-id-cell">
                      <CopyableDealId
                        id={order.id}
                        compact
                        testId={`order-deal-id-${order.id}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && orders.length > 0 && filteredOrders.length === 0 ? (
        <div className="card">
          <p className="muted">Нет сделок по выбранным фильтрам.</p>
        </div>
      ) : null}
    </div>
  );
}
