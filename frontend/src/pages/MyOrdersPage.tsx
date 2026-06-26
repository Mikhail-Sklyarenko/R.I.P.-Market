import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyOrders } from '../api/marketplace';
import type { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor } from '../utils/format';

export function MyOrdersPage() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    listMyOrders(token)
      .then(setOrders)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>My orders</h2>
          <p className="muted">Purchases and sales for your account.</p>
        </div>
      </div>

      <ErrorAlert error={error} />

      {loading ? <p className="muted">Loading orders…</p> : null}

      {!loading && orders.length === 0 ? (
        <div className="card">
          <p>No orders yet.</p>
          <Link to="/catalog">Browse catalog</Link>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table" data-testid="my-orders-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Role</th>
              <th>Status</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const role =
                user?.id === order.buyerId
                  ? 'Buyer'
                  : user?.id === order.sellerId
                    ? 'Seller'
                    : '—';
              return (
                <tr key={order.id} data-testid={`order-row-${order.status}`}>
                  <td>{order.lot.inventoryAsset.itemDefinition.marketHashName}</td>
                  <td>{role}</td>
                  <td>
                    <span className={`badge badge-${order.status.toLowerCase()}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{formatUsdFromMinor(order.amountMinor)}</td>
                  <td>
                    <Link to={`/orders/${order.id}`}>Open</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
