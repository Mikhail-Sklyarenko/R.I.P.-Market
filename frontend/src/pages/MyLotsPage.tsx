import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelLot, getMyLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor } from '../utils/format';

export function MyLotsPage() {
  const { token } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    getMyLots(token)
      .then(setLots)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel(lotId: string) {
    if (!token) {
      return;
    }
    setCancelingId(lotId);
    setError(null);
    try {
      await cancelLot(token, lotId);
      const data = await getMyLots(token);
      setLots(data);
    } catch (err) {
      setError(err);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>My sales</h2>
          <p className="muted">Track listing status and payout breakdown.</p>
        </div>
        <Link to="/sell/inventory" className="button secondary">
          New listing
        </Link>
      </div>

      <ErrorAlert error={error} />

      {loading ? <p className="muted">Loading listings…</p> : null}

      {!loading && lots.length === 0 ? (
        <div className="card">
          <p>No listings yet.</p>
          <Link to="/sell/inventory">Go to inventory</Link>
        </div>
      ) : null}

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
            {lots.map((lot) => (
              <tr key={lot.id} data-testid={`lot-row-${lot.status}`}>
                <td>{lot.inventoryAsset.itemDefinition.marketHashName}</td>
                <td>
                  <span className={`badge badge-${lot.status.toLowerCase()}`}>{lot.status}</span>
                </td>
                <td>{formatUsdFromMinor(lot.priceMinor)}</td>
                <td>{formatUsdFromMinor(lot.commissionMinor)}</td>
                <td>{formatUsdFromMinor(lot.sellerReceiveMinor)}</td>
                <td>
                  {lot.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      className="link-button"
                      disabled={cancelingId === lot.id}
                      data-testid={`cancel-lot-${lot.id}`}
                      onClick={() => void handleCancel(lot.id)}
                    >
                      {cancelingId === lot.id ? 'Canceling…' : 'Cancel'}
                    </button>
                  ) : lot.status === 'RESERVED' || lot.status === 'SOLD' ? (
                    <Link to="/my/orders">View orders</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
