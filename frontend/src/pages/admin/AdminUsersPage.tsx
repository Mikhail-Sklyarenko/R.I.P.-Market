import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminUser,
  getAdminUsers,
  restrictAdminUser,
  unrestrictAdminUser,
} from '../../api/admin';
import type { AdminUserSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { AdminReasonModal } from '../../components/AdminReasonModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatUsdFromMinor } from '../../utils/format';

type RestrictAction = {
  userId: string;
  type: 'restrict' | 'unrestrict';
  status?: 'SELL_BLOCK' | 'BUY_BLOCK' | 'SUSPENDED';
};

function walletAvailable(wallet: AdminUserSummary['wallet']): string {
  const account = wallet?.accounts.find((item) => item.type === 'AVAILABLE');
  return account ? formatUsdFromMinor(account.balanceMinor) : '—';
}

export function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Awaited<
    ReturnType<typeof getAdminUser>
  > | null>(null);
  const [pendingAction, setPendingAction] = useState<RestrictAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    getAdminUsers(token)
      .then(setUsers)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedUserId) {
      setSelectedDetail(null);
      return;
    }
    getAdminUser(token, selectedUserId)
      .then(setSelectedDetail)
      .catch((err: unknown) => setError(err));
  }, [token, selectedUserId]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') {
      return users;
    }
    if (statusFilter === 'restricted') {
      return users.filter((user) => user.status !== 'ACTIVE');
    }
    return users.filter((user) => user.status === statusFilter);
  }, [users, statusFilter]);

  const summary = useMemo(
    () => ({
      total: users.length,
      restricted: users.filter((user) => user.status !== 'ACTIVE').length,
      sellers: users.filter((user) => user.role === 'SELLER').length,
      buyers: users.filter((user) => user.role === 'BUYER').length,
    }),
    [users],
  );

  async function handleConfirmAction() {
    if (!token || !pendingAction || reason.trim().length < 3) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (pendingAction.type === 'restrict' && pendingAction.status) {
        await restrictAdminUser(
          token,
          pendingAction.userId,
          pendingAction.status,
          reason.trim(),
        );
      } else {
        await unrestrictAdminUser(token, pendingAction.userId, reason.trim());
      }
      const refreshed = await getAdminUsers(token);
      setUsers(refreshed);
      if (selectedUserId === pendingAction.userId) {
        const detail = await getAdminUser(token, pendingAction.userId);
        setSelectedDetail(detail);
      }
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
      <div className="page-header">
        <div>
          <h2>Admin users</h2>
          <p className="muted">Accounts, restrictions, and wallet overview.</p>
        </div>
      </div>

      <ErrorAlert error={error} />

      {!loading ? (
        <div className="deals-summary-grid" data-testid="admin-users-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Users</span>
            <strong className="seller-summary-count">{summary.total}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Restricted</span>
            <strong className="seller-summary-count">{summary.restricted}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Sellers</span>
            <strong className="seller-summary-count">{summary.sellers}</strong>
          </div>
          <div className="card seller-summary-card">
            <span className="eyebrow">Buyers</span>
            <strong className="seller-summary-count">{summary.buyers}</strong>
          </div>
        </div>
      ) : null}

      <div className="card catalog-filters" data-testid="admin-users-filters">
        <label className="field catalog-filter-field">
          <span className="field-label">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            data-testid="admin-users-status-filter"
          >
            <option value="all">All</option>
            <option value="ACTIVE">Active</option>
            <option value="restricted">Any restriction</option>
            <option value="SELL_BLOCK">Sell blocked</option>
            <option value="BUY_BLOCK">Buy blocked</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
      </div>

      {loading ? <p className="muted">Loading users…</p> : null}

      <div className="table-wrap">
        <table className="data-table" data-testid="admin-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Available</th>
              <th>Lots</th>
              <th>Orders</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className={user.status !== 'ACTIVE' ? 'admin-row-attention' : undefined}
                data-testid={`admin-user-row-${user.status}`}
              >
                <td>{user.username}</td>
                <td>{user.role}</td>
                <td>
                  <span className={`badge badge-${user.status.toLowerCase()}`}>
                    {user.status}
                  </span>
                </td>
                <td>{walletAvailable(user.wallet)}</td>
                <td>{user._count?.lots ?? 0}</td>
                <td>
                  {(user._count?.buyOrders ?? 0) + (user._count?.sellOrders ?? 0)}
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    data-testid={`admin-user-open-${user.id}`}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDetail ? (
        <section className="card admin-section" data-testid="admin-user-detail">
          <h3>{selectedDetail.user.username}</h3>
          <dl className="meta-list">
            <div>
              <dt>Status</dt>
              <dd>{selectedDetail.user.status}</dd>
            </div>
            <div>
              <dt>Open orders</dt>
              <dd>{selectedDetail.openOrderCount}</dd>
            </div>
            <div>
              <dt>Lots / buy / sell</dt>
              <dd>
                {selectedDetail.user._count?.lots ?? 0} /{' '}
                {selectedDetail.user._count?.buyOrders ?? 0} /{' '}
                {selectedDetail.user._count?.sellOrders ?? 0}
              </dd>
            </div>
            <div>
              <dt>Available balance</dt>
              <dd>{walletAvailable(selectedDetail.user.wallet)}</dd>
            </div>
          </dl>

          <div className="stack horizontal">
            {selectedDetail.user.status === 'ACTIVE' ? (
              <>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="admin-restrict-sell"
                  onClick={() =>
                    setPendingAction({
                      userId: selectedDetail.user.id,
                      type: 'restrict',
                      status: 'SELL_BLOCK',
                    })
                  }
                >
                  Block selling
                </button>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="admin-restrict-buy"
                  onClick={() =>
                    setPendingAction({
                      userId: selectedDetail.user.id,
                      type: 'restrict',
                      status: 'BUY_BLOCK',
                    })
                  }
                >
                  Block buying
                </button>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="admin-restrict-suspend"
                  onClick={() =>
                    setPendingAction({
                      userId: selectedDetail.user.id,
                      type: 'restrict',
                      status: 'SUSPENDED',
                    })
                  }
                >
                  Suspend
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button primary sm"
                data-testid="admin-unrestrict-user"
                onClick={() =>
                  setPendingAction({
                    userId: selectedDetail.user.id,
                    type: 'unrestrict',
                  })
                }
              >
                Unrestrict
              </button>
            )}
            <Link to="/admin/orders" className="button secondary sm">
              View orders
            </Link>
          </div>

          {selectedDetail.auditLogs.length > 0 ? (
            <>
              <h4 className="eyebrow">Restriction audit</h4>
              <ul className="simple-list">
                {selectedDetail.auditLogs.map((log) => (
                  <li key={log.id}>
                    {log.action}: {log.reason ?? '—'} ·{' '}
                    {new Date(log.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <AdminReasonModal
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'unrestrict'
            ? 'Unrestrict user'
            : 'Restrict user'
        }
        message="Provide an audit reason for this action."
        reason={reason}
        onReasonChange={setReason}
        loading={actionLoading}
        confirmLabel={pendingAction?.type === 'unrestrict' ? 'Unrestrict' : 'Restrict'}
        onCancel={() => {
          setPendingAction(null);
          setReason('');
        }}
        onConfirm={() => void handleConfirmAction()}
        reasonTestId="admin-user-action-reason"
      />
    </div>
  );
}
