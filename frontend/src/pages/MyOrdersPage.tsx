import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyOrders } from '../api/marketplace';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { DealOrderCard } from '../components/DealOrderCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { useWalletSummary } from '../hooks/useWalletSummary';
import {
  computeSellerPendingReceiveMinor,
  filterOrders,
  getOrderSummaryCounts,
  isActiveOrderStatus,
  type OrderRoleFilter,
  type OrderStatusFilter,
} from '../utils/my-orders';

type MyOrdersPageProps = {
  embedded?: boolean;
  sellerOnly?: boolean;
  buyerOnly?: boolean;
  emptyStateMode?: 'purchases' | 'sales' | 'default';
};

function sortDealsForProduct(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const aActive = isActiveOrderStatus(a.status) ? 0 : 1;
    const bActive = isActiveOrderStatus(b.status) ? 0 : 1;
    if (aActive !== bActive) {
      return aActive - bActive;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function MyOrdersPage({
  embedded = false,
  sellerOnly = false,
  buyerOnly = false,
  emptyStateMode = 'default',
}: MyOrdersPageProps) {
  const { t } = useLocale();
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
    () => sortDealsForProduct(filterOrders(orders, user?.id, 'all', 'all')),
    [orders, user?.id],
  );

  const showRole = !sellerOnly && !buyerOnly;

  return (
    <div className={embedded ? 'seller-activity-panel' : 'page'}>
      {!embedded ? (
        <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')} />
      ) : null}

      <ErrorAlert error={error} />

      {!embedded && walletSummary ? (
        <div
          className="wallet-balance-grid my-orders-wallet-summary"
          data-testid="my-orders-wallet-summary"
        >
          <div className="card wallet-balance-card" data-testid="my-orders-available">
            <span className="eyebrow">{t('orders.available')}</span>
            <MoneyDisplay minor={walletSummary.availableMinor} strong />
          </div>
          <div className="card wallet-balance-card" data-testid="my-orders-hold">
            <span className="eyebrow">{t('orders.hold')}</span>
            <MoneyDisplay minor={walletSummary.holdMinor} strong />
          </div>
          {pendingReceiveMinor > 0 ? (
            <div
              className="card wallet-balance-card"
              data-testid="my-orders-pending-receive"
            >
              <span className="eyebrow">{t('orders.toReceive')}</span>
              <MoneyDisplay minor={pendingReceiveMinor} strong />
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <LoadingState message={t('orders.loading')} /> : null}

      {!loading && summaryOrders.length > 0 ? (
        <div className="deals-summary-strip" data-testid="my-orders-summary">
          <div className="deals-summary-chip">
            <span className="eyebrow">{t('orders.active')}</span>
            <strong>{summary.active}</strong>
          </div>
          <div className="deals-summary-chip">
            <span className="eyebrow">{t('orders.awaitingTransfer')}</span>
            <strong>{summary.waitingTrade}</strong>
          </div>
          <div className="deals-summary-chip">
            <span className="eyebrow">{t('orders.completed')}</span>
            <strong>{summary.completed}</strong>
          </div>
          {summary.review > 0 ? (
            <div className="deals-summary-chip deals-summary-chip-alert">
              <span className="eyebrow">{t('orders.underReview')}</span>
              <strong>{summary.review}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && orders.length > 0 ? (
        <div className="card deals-filters" data-testid="my-orders-filters">
          <div className="catalog-filters-row">
            {showRole ? (
              <label className="field catalog-filter-field">
                <span className="field-label">{t('orders.role')}</span>
                <select
                  value={roleFilter}
                  onChange={(event) =>
                    setRoleFilter(event.target.value as OrderRoleFilter)
                  }
                  data-testid="my-orders-role-filter"
                >
                  <option value="all">{t('orders.all')}</option>
                  <option value="buyer">{t('orders.buyer')}</option>
                  <option value="seller">{t('orders.seller')}</option>
                </select>
              </label>
            ) : null}
            <label className="field catalog-filter-field">
              <span className="field-label">{t('orders.status')}</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as OrderStatusFilter)
                }
                data-testid="my-orders-status-filter"
              >
                <option value="all">{t('orders.all')}</option>
                <option value="active">{t('orders.active')}</option>
                <option value="waiting">{t('orders.awaitingTransfer')}</option>
                <option value="completed">{t('orders.completed')}</option>
                <option value="review">{t('orders.underReview')}</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {!loading && orders.length === 0 ? (
        <EmptyState
          title={
            emptyStateMode === 'purchases'
              ? t('orders.emptyPurchasesTitle')
              : emptyStateMode === 'sales'
                ? t('orders.emptySalesTitle')
                : t('orders.emptyTitle')
          }
          message={
            emptyStateMode === 'purchases'
              ? t('orders.emptyPurchasesMessage')
              : emptyStateMode === 'sales'
                ? t('orders.emptySalesMessage')
                : t('orders.emptyMessage')
          }
          action={
            emptyStateMode === 'purchases' ? (
              <Link to="/catalog" className="button primary">
                {t('orders.toCatalog')}
              </Link>
            ) : emptyStateMode === 'sales' ? (
              <Link to="/sell/inventory" className="button primary">
                {t('orders.toInventory')}
              </Link>
            ) : (
              <div className="deals-empty-actions">
                <Link to="/catalog" className="button primary">
                  {t('orders.toCatalog')}
                </Link>
                <Link to="/sell/inventory" className="button secondary">
                  {t('orders.toInventory')}
                </Link>
              </div>
            )
          }
        />
      ) : null}

      {filteredOrders.length > 0 ? (
        <div className="deal-order-cards" data-testid="my-orders-table">
          {filteredOrders.map((order) => (
            <DealOrderCard
              key={order.id}
              order={order}
              userId={user?.id}
              showRole={showRole}
            />
          ))}
        </div>
      ) : null}

      {!loading && orders.length > 0 && filteredOrders.length === 0 ? (
        <div className="card">
          <p className="muted">{t('orders.noFilterResults')}</p>
        </div>
      ) : null}
    </div>
  );
}
