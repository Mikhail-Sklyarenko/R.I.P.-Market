import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOrders } from '../../api/admin';
import type { AdminOrderSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatUsdFromMinor } from '../../utils/format';

export function AdminOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    getAdminOrders(token)
      .then(setOrders)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Admin orders</h2>
          <p className="muted">Review incidents and resolve disputes.</p>
        </div>
        <Link to="/admin/outbox" className="button secondary">
          Outbox
        </Link>
      </div>

      <ErrorAlert error={error} />

      {loading ? <p className="muted">Loading orders…</p> : null}

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
            {orders.map((order) => (
              <tr key={order.id} data-testid={`admin-order-row-${order.status}`}>
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
