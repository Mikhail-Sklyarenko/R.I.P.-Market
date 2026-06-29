import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelLot, getMyLots, listMyOrders } from '../api/sell';
import type { Lot, Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { StatusBadge } from '../components/StatusBadge';

const SUMMARY_STATUSES = ['ACTIVE', 'RESERVED', 'SOLD', 'CANCELED'] as const;

export function MyLotsPage() {
  const { token } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }
    const [lotsData, ordersData] = await Promise.all([
      getMyLots(token),
      listMyOrders(token),
    ]);
    setLots(lotsData);
    setOrders(ordersData);
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    loadData()
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, loadData]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lot of lots) {
      counts[lot.status] = (counts[lot.status] ?? 0) + 1;
    }
    return counts;
  }, [lots]);

  const orderByLotId = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of orders) {
      const existing = map.get(order.lotId);
      if (!existing || new Date(order.createdAt) > new Date(existing.createdAt)) {
        map.set(order.lotId, order);
      }
    }
    return map;
  }, [orders]);

  async function handleCancel(lotId: string) {
    if (!token) {
      return;
    }
    setCancelingId(lotId);
    setError(null);
    try {
      await cancelLot(token, lotId);
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Мои лоты"
        subtitle="Статусы выставленных предметов и выплаты."
        actions={
          <Link to="/sell/inventory" className="button secondary">
            Новый лот
          </Link>
        }
      />

      <ErrorAlert error={error} />

      {loading ? <LoadingState message="Загрузка лотов…" /> : null}

      {!loading && lots.length > 0 ? (
        <div className="seller-summary-grid" data-testid="my-lots-summary">
          {SUMMARY_STATUSES.map((status) => (
            <div key={status} className="card seller-summary-card">
              <span className="eyebrow">{status}</span>
              <strong className="seller-summary-count">{statusCounts[status] ?? 0}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && lots.length === 0 ? (
        <EmptyState
          title="Лотов пока нет"
          message="Выставьте предмет из инвентаря, чтобы он появился в каталоге."
          action={
            <Link to="/sell/inventory" className="button primary">
              К инвентарю
            </Link>
          }
        />
      ) : null}

      {lots.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table" data-testid="my-lots-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Price</th>
                <th>Commission</th>
                <th>You receive</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const linkedOrder = orderByLotId.get(lot.id);
                return (
                  <tr key={lot.id} data-testid={`lot-row-${lot.status}`}>
                    <td>{lot.inventoryAsset.itemDefinition.marketHashName}</td>
                    <td>
                      <StatusBadge status={lot.status} />
                    </td>
                    <td>
                      <MoneyDisplay minor={lot.priceMinor} />
                    </td>
                    <td>
                      <MoneyDisplay minor={lot.commissionMinor} />
                    </td>
                    <td>
                      <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
                    </td>
                    <td>
                      {lot.status === 'ACTIVE' ? (
                        <>
                          <Link
                            to={`/lots/${lot.id}`}
                            className="link-button"
                            data-testid={`view-catalog-lot-${lot.id}`}
                          >
                            В каталоге
                          </Link>
                          <button
                            type="button"
                            className="link-button"
                            disabled={cancelingId === lot.id}
                            data-testid={`cancel-lot-${lot.id}`}
                            onClick={() => void handleCancel(lot.id)}
                          >
                            {cancelingId === lot.id ? 'Canceling…' : 'Cancel'}
                          </button>
                        </>
                      ) : null}
                      {(lot.status === 'RESERVED' || lot.status === 'SOLD') && linkedOrder ? (
                        <Link
                          to={`/orders/${linkedOrder.id}`}
                          data-testid={`view-order-${lot.id}`}
                        >
                          View order
                        </Link>
                      ) : (lot.status === 'RESERVED' || lot.status === 'SOLD') ? (
                        <Link to="/my/orders">View orders</Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <SellerSaleInfo />
    </div>
  );
}
