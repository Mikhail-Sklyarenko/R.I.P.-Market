import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelLot, getMyLots, listMyOrders, updateLotPrice } from '../api/sell';
import type { Lot, Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { lotSummaryLabel, useLocale } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { StatusBadge } from '../components/StatusBadge';
import { parseUsdToMinor } from '../utils/format';
import { minorToPriceInput } from '../utils/inventory-pricing';
import {
  filterSellerLots,
  formatLotStatus,
  LOT_STATUS_FILTER_IDS,
  PENDING_PAYOUT_ORDER_STATUSES,
  type LotStatusFilter,
} from '../utils/seller-flow';

const SUMMARY_STATUSES = ['ACTIVE', 'RESERVED', 'SOLD', 'CANCELED'] as const;

type MyLotsPageProps = {
  embedded?: boolean;
};

export function MyLotsPage({ embedded = false }: MyLotsPageProps) {
  const { locale, t } = useLocale();
  const { token } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
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

  function startEditPrice(lot: Lot) {
    setEditingLotId(lot.id);
    setEditPriceInput(minorToPriceInput(Number(lot.priceMinor)));
    setError(null);
  }

  function cancelEditPrice() {
    setEditingLotId(null);
    setEditPriceInput('');
  }

  async function handleSavePrice(lotId: string) {
    if (!token) {
      return;
    }
    const priceMinor = parseUsdToMinor(editPriceInput);
    if (!priceMinor) {
      setError(new Error('Enter a valid price greater than zero.'));
      return;
    }
    setSavingPriceId(lotId);
    setError(null);
    try {
      await updateLotPrice(token, lotId, priceMinor);
      cancelEditPrice();
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setSavingPriceId(null);
    }
  }

  async function handleCancel(lotId: string) {
    if (!token) {
      return;
    }
    setCancelingId(lotId);
    setError(null);
    try {
      await cancelLot(token, lotId);
      if (editingLotId === lotId) {
        cancelEditPrice();
      }
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
          title={t('lots.title')}
          subtitle={t('lots.subtitle')}
          actions={
            <Link to="/sell/inventory" className="button secondary">
              {t('lots.newLot')}
            </Link>
          }
        />
      ) : null}

      <ErrorAlert error={error} />

      {loading ? <LoadingState message={t('lots.loading')} /> : null}

      {!loading && lots.length > 0 ? (
        <>
          <div className="seller-summary-grid" data-testid="my-lots-summary">
            {SUMMARY_STATUSES.map((status) => (
              <div key={status} className="card seller-summary-card">
                <span className="eyebrow">{lotSummaryLabel(status, locale)}</span>
                <strong className="seller-summary-count">{statusCounts[status] ?? 0}</strong>
              </div>
            ))}
          </div>

          {pendingReceiveMinor > 0 ? (
            <div className="card my-lots-pending-payout" data-testid="my-lots-pending-payout">
              <span className="muted small">{t('lots.pendingPayout')}</span>
              <MoneyDisplay minor={pendingReceiveMinor} strong />
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && lots.length === 0 ? (
        <EmptyState
          title={t('lots.emptyTitle')}
          message={t('lots.emptyMessage')}
          action={
            <Link to="/sell/inventory" className="button primary">
              {t('lots.toInventory')}
            </Link>
          }
        />
      ) : null}

      {lots.length > 0 ? (
        <>
          <div className="card inventory-filters" data-testid="my-lots-filters">
            <div className="inventory-filters-row">
              <label className="field catalog-filter-field">
                <span className="field-label">{t('lots.search')}</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('lots.searchPlaceholder')}
                  data-testid="my-lots-search"
                />
              </label>
              <label className="field catalog-filter-field">
                <span className="field-label">{t('lots.status')}</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as LotStatusFilter)
                  }
                  data-testid="my-lots-status-filter"
                >
                  {LOT_STATUS_FILTER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(`lotFilter.${id}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filteredLots.length === 0 ? (
            <EmptyState
              title={t('common.nothingFound')}
              message={t('common.changeFilters')}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table" data-testid="my-lots-table">
                <thead>
                  <tr>
                    <th>{t('lots.item')}</th>
                    <th>{t('lots.status')}</th>
                    <th>{t('lots.price')}</th>
                    <th>{t('lots.commission')}</th>
                    <th>{t('lots.youReceive')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map((lot) => {
                    const linkedOrder = orderByLotId.get(lot.id);
                    const isEditing = editingLotId === lot.id;
                    return (
                      <tr key={lot.id} data-testid={`lot-row-${lot.status}`}>
                        <td>{lot.inventoryAsset.itemDefinition.marketHashName}</td>
                        <td>
                          <StatusBadge
                            status={lot.status}
                            label={formatLotStatus(lot.status, locale)}
                          />
                        </td>
                        <td>
                          {isEditing ? (
                            <label className="field my-lots-edit-price">
                              <span className="sr-only">{t('lots.newPriceAria')}</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={editPriceInput}
                                onChange={(event) => setEditPriceInput(event.target.value)}
                                data-testid={`edit-lot-price-input-${lot.id}`}
                                autoFocus
                              />
                            </label>
                          ) : (
                            <MoneyDisplay minor={lot.priceMinor} />
                          )}
                        </td>
                        <td>
                          <MoneyDisplay minor={lot.commissionMinor} />
                        </td>
                        <td>
                          <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
                        </td>
                        <td>
                          {lot.status === 'ACTIVE' ? (
                            <div className="my-lots-actions">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="link-button"
                                    disabled={savingPriceId === lot.id}
                                    data-testid={`save-lot-price-${lot.id}`}
                                    onClick={() => void handleSavePrice(lot.id)}
                                  >
                                    {savingPriceId === lot.id ? t('lots.saving') : t('lots.save')}
                                  </button>
                                  <button
                                    type="button"
                                    className="link-button"
                                    disabled={savingPriceId === lot.id}
                                    data-testid={`cancel-edit-lot-price-${lot.id}`}
                                    onClick={cancelEditPrice}
                                  >
                                    {t('lots.cancel')}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <Link
                                    to={`/lots/${lot.id}`}
                                    className="link-button"
                                    data-testid={`view-catalog-lot-${lot.id}`}
                                  >
                                    {t('lots.inCatalog')}
                                  </Link>
                                  <button
                                    type="button"
                                    className="link-button"
                                    data-testid={`edit-lot-price-${lot.id}`}
                                    onClick={() => startEditPrice(lot)}
                                  >
                                    {t('lots.editPrice')}
                                  </button>
                                  <button
                                    type="button"
                                    className="link-button"
                                    disabled={cancelingId === lot.id}
                                    data-testid={`cancel-lot-${lot.id}`}
                                    onClick={() => void handleCancel(lot.id)}
                                  >
                                    {cancelingId === lot.id ? t('lots.unlisting') : t('lots.unlist')}
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                          {(lot.status === 'RESERVED' || lot.status === 'SOLD') && linkedOrder ? (
                            <Link
                              to={`/orders/${linkedOrder.id}`}
                              data-testid={`view-order-${lot.id}`}
                            >
                              {t('lots.openDeal')}
                            </Link>
                          ) : lot.status === 'RESERVED' || lot.status === 'SOLD' ? (
                            <Link to="/deals?tab=sales">{t('lots.myDeals')}</Link>
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
