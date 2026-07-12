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
import {
  filterSellerLots,
  formatLotStatus,
  LOT_STATUS_FILTERS,
  LOT_SUMMARY_LABELS,
  PENDING_PAYOUT_ORDER_STATUSES,
  type LotStatusFilter,
} from '../utils/seller-flow';

const SUMMARY_STATUSES = ['ACTIVE', 'RESERVED', 'SOLD', 'CANCELED'] as const;

type MyLotsPageProps = {
  embedded?: boolean;
};

export function MyLotsPage({ embedded = false }: MyLotsPageProps) {
  const { token } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LotStatusFilter>('all');

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }
    const [lotsData, ordersData] = await Promise.all([
      getMyLots(token),
      listMyOrders(token, { role: 'seller' }),
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

  const filteredLots = useMemo(
    () => filterSellerLots(lots, search, statusFilter),
    [lots, search, statusFilter],
  );

  const pendingReceiveMinor = useMemo(() => {
    const reservedLotIds = new Set(
      lots.filter((lot) => lot.status === 'RESERVED').map((lot) => lot.id),
    );
    let total = 0;
    for (const order of orders) {
      if (!PENDING_PAYOUT_ORDER_STATUSES.has(order.status)) {
        continue;
      }
      if (!reservedLotIds.has(order.lotId)) {
        continue;
      }
      total += Number(order.lot.sellerReceiveMinor);
    }
    return total;
  }, [lots, orders]);

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
    <div className={embedded ? 'seller-activity-panel' : 'page'}>
      {!embedded ? (
        <PageHeader
          title="Мои лоты"
          subtitle="Статусы выставленных предметов и выплаты."
          actions={
            <Link to="/sell/inventory" className="button secondary">
              Новый лот
            </Link>
          }
        />
      ) : null}

      <ErrorAlert error={error} />

      {loading ? <LoadingState message="Загрузка лотов…" /> : null}

      {!loading && lots.length > 0 ? (
        <>
          <div className="seller-summary-grid" data-testid="my-lots-summary">
            {SUMMARY_STATUSES.map((status) => (
              <div key={status} className="card seller-summary-card">
                <span className="eyebrow">{LOT_SUMMARY_LABELS[status] ?? status}</span>
                <strong className="seller-summary-count">{statusCounts[status] ?? 0}</strong>
              </div>
            ))}
          </div>

          {pendingReceiveMinor > 0 ? (
            <div className="card my-lots-pending-payout" data-testid="my-lots-pending-payout">
              <span className="muted small">Ожидается к получению</span>
              <MoneyDisplay minor={pendingReceiveMinor} strong />
            </div>
          ) : null}
        </>
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
        <>
          <div className="card inventory-filters" data-testid="my-lots-filters">
            <div className="inventory-filters-row">
              <label className="field catalog-filter-field">
                <span className="field-label">Поиск</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Название скина…"
                  data-testid="my-lots-search"
                />
              </label>
              <label className="field catalog-filter-field">
                <span className="field-label">Статус лота</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as LotStatusFilter)
                  }
                  data-testid="my-lots-status-filter"
                >
                  {LOT_STATUS_FILTERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filteredLots.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              message="Измените поиск или фильтр статуса."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table" data-testid="my-lots-table">
                <thead>
                  <tr>
                    <th>Предмет</th>
                    <th>Статус</th>
                    <th>Цена</th>
                    <th>Комиссия</th>
                    <th>Вы получите</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map((lot) => {
                    const linkedOrder = orderByLotId.get(lot.id);
                    return (
                      <tr key={lot.id} data-testid={`lot-row-${lot.status}`}>
                        <td>{lot.inventoryAsset.itemDefinition.marketHashName}</td>
                        <td>
                          <StatusBadge status={lot.status} label={formatLotStatus(lot.status)} />
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
                                {cancelingId === lot.id ? 'Отмена…' : 'Отменить'}
                              </button>
                            </>
                          ) : null}
                          {(lot.status === 'RESERVED' || lot.status === 'SOLD') && linkedOrder ? (
                            <Link
                              to={`/orders/${linkedOrder.id}`}
                              data-testid={`view-order-${lot.id}`}
                            >
                              Открыть сделку
                            </Link>
                          ) : lot.status === 'RESERVED' || lot.status === 'SOLD' ? (
                            <Link to="/deals?tab=sales">Мои сделки</Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {!embedded ? <SellerSaleInfo /> : null}
    </div>
  );
}
