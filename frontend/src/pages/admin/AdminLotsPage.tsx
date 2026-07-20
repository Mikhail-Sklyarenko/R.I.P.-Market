import { useEffect, useMemo, useState } from 'react';
import {
  blockAdminLot,
  cancelAdminLot,
  getAdminLots,
  unblockAdminLot,
} from '../../api/admin';
import type { AdminLotSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { AdminReasonModal } from '../../components/AdminReasonModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { formatUsdFromMinor } from '../../utils/format';

type LotAction = 'block' | 'unblock' | 'cancel';

export function AdminLotsPage() {
  const { token } = useAuth();
  const [lots, setLots] = useState<AdminLotSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<{
    lotId: string;
    action: LotAction;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const query = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      q: search.trim() || undefined,
      page: 1,
      limit: 50,
    }),
    [statusFilter, search],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    getAdminLots(token, query)
      .then((response) => {
        setLots(response.items);
        setTotal(response.total);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, query]);

  const summary = useMemo(
    () => ({
      total,
      active: lots.filter((lot) => lot.status === 'ACTIVE').length,
      blocked: lots.filter((lot) => lot.status === 'BLOCKED').length,
      reserved: lots.filter((lot) => lot.status === 'RESERVED').length,
    }),
    [lots, total],
  );

  async function handleConfirmAction() {
    if (!token || !pendingAction || reason.trim().length < 3) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const { lotId, action } = pendingAction;
      if (action === 'block') {
        await blockAdminLot(token, lotId, reason.trim());
      } else if (action === 'unblock') {
        await unblockAdminLot(token, lotId, reason.trim());
      } else {
        await cancelAdminLot(token, lotId, reason.trim());
      }
      const response = await getAdminLots(token, query);
      setLots(response.items);
      setTotal(response.total);
      setPendingAction(null);
      setReason('');
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Лоты"
        subtitle="Модерация объявлений с записью в audit log."
      />

      <ErrorAlert error={error} />

      {!loading ? (
        <div className="deals-summary-grid" data-testid="admin-lots-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Всего</span>
            <strong className="seller-summary-count">{summary.total}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Активные</span>
            <strong className="seller-summary-count">{summary.active}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Заблокированы</span>
            <strong className="seller-summary-count">{summary.blocked}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">В резерве</span>
            <strong className="seller-summary-count">{summary.reserved}</strong>
          </div>
        </div>
      ) : null}

      <div className="card catalog-filters" data-testid="admin-lots-filters">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">Поиск</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="admin-lots-search"
              placeholder="Название предмета…"
            />
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">Статус</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              data-testid="admin-lots-status-filter"
            >
              <option value="all">Все</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? <LoadingState message="Загрузка лотов…" /> : null}

      {!loading && lots.length === 0 ? (
        <EmptyState title="Лотов нет" message="Нет лотов по текущим фильтрам." />
      ) : null}

      {!loading && lots.length > 0 ? (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table" data-testid="admin-lots-table">
              <thead>
                <tr>
                  <th>Предмет</th>
                  <th>Продавец</th>
                  <th>Статус</th>
                  <th>Цена</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr
                    key={lot.id}
                    className={
                      lot.status === 'BLOCKED' ? 'admin-row-attention' : undefined
                    }
                    data-testid={`admin-lot-row-${lot.status}`}
                  >
                    <td>{lot.inventoryAsset.itemDefinition.marketHashName}</td>
                    <td>{lot.seller.username}</td>
                    <td>
                      <span className={`badge badge-${lot.status.toLowerCase()}`}>
                        {lot.status}
                      </span>
                    </td>
                    <td>{formatUsdFromMinor(lot.priceMinor)}</td>
                    <td>
                      <div className="stack horizontal">
                        {lot.status === 'ACTIVE' ? (
                          <>
                            <button
                              type="button"
                              className="button secondary sm"
                              data-testid={`admin-lot-block-${lot.id}`}
                              onClick={() =>
                                setPendingAction({ lotId: lot.id, action: 'block' })
                              }
                            >
                              Block
                            </button>
                            <button
                              type="button"
                              className="button secondary sm"
                              data-testid={`admin-lot-cancel-${lot.id}`}
                              onClick={() =>
                                setPendingAction({ lotId: lot.id, action: 'cancel' })
                              }
                            >
                              Cancel
                            </button>
                          </>
                        ) : null}
                        {lot.status === 'BLOCKED' ? (
                          <button
                            type="button"
                            className="button primary sm"
                            data-testid={`admin-lot-unblock-${lot.id}`}
                            onClick={() =>
                              setPendingAction({ lotId: lot.id, action: 'unblock' })
                            }
                          >
                            Unblock
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <AdminReasonModal
        open={pendingAction !== null}
        title={
          pendingAction?.action === 'block'
            ? 'Block lot'
            : pendingAction?.action === 'unblock'
              ? 'Unblock lot'
              : 'Cancel lot'
        }
        message="This action is recorded in the audit log."
        reason={reason}
        onReasonChange={setReason}
        loading={actionLoading}
        confirmLabel={
          pendingAction?.action === 'block'
            ? 'Block'
            : pendingAction?.action === 'unblock'
              ? 'Unblock'
              : 'Cancel lot'
        }
        onCancel={() => {
          setPendingAction(null);
          setReason('');
        }}
        onConfirm={() => void handleConfirmAction()}
        reasonTestId="admin-lot-action-reason"
      />
    </div>
  );
}
