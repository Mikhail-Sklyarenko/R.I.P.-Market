import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createOrder, getLot, getWallet } from '../api/marketplace';
import { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor } from '../utils/format';

export function LotPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Awaited<ReturnType<typeof getLot>> | null>(null);
  const [availableMinor, setAvailableMinor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    getLot(id)
      .then(setLot)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!token) {
      setAvailableMinor(null);
      return;
    }
    getWallet(token)
      .then((wallet) => setAvailableMinor(Number(wallet.summary.availableMinor)))
      .catch(() => setAvailableMinor(null));
  }, [token]);

  async function handleBuy() {
    if (!token || !lot) {
      navigate('/login');
      return;
    }

    const priceMinor = Number(lot.priceMinor);
    if (availableMinor !== null && availableMinor < priceMinor) {
      navigate(`/wallet?returnUrl=${encodeURIComponent(`/lots/${lot.id}`)}&needed=${priceMinor}`);
      return;
    }

    setBuying(true);
    setError(null);
    try {
      const order = await createOrder(token, lot.id);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_BALANCE') {
        navigate(`/wallet?returnUrl=${encodeURIComponent(`/lots/${lot.id}`)}&needed=${priceMinor}`);
        return;
      }
      setError(err);
    } finally {
      setBuying(false);
    }
  }

  if (!id) {
    return null;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Listing</h2>
          <Link to="/catalog" className="muted">
            Back to catalog
          </Link>
        </div>
      </div>

      {loading ? <p className="muted">Loading listing…</p> : null}

      {lot ? (
        <div className="card form-card">
          <h3>{lot.inventoryAsset.itemDefinition.marketHashName}</h3>
          <p className="muted">{lot.inventoryAsset.wear ?? 'Unknown wear'}</p>

          <div className="pricing-preview">
            <div>
              <span>Price</span>
              <strong>{formatUsdFromMinor(lot.priceMinor)}</strong>
            </div>
            <div>
              <span>Commission</span>
              <strong>{formatUsdFromMinor(lot.commissionMinor)}</strong>
            </div>
            <div>
              <span>Seller receives</span>
              <strong>{formatUsdFromMinor(lot.sellerReceiveMinor)}</strong>
            </div>
          </div>

          {availableMinor !== null ? (
            <p className="muted small">
              Your available balance: {formatUsdFromMinor(availableMinor)}
            </p>
          ) : null}

          <ErrorAlert error={error} />

          {lot.status !== 'ACTIVE' ? (
            <p className="muted" data-testid="lot-unavailable-message">
              This listing is no longer available for purchase ({lot.status}).
            </p>
          ) : null}

          {user?.role === 'SELLER' ? (
            <p className="muted" data-testid="seller-cannot-buy-message">
              Switch to a buyer account to purchase listings.
            </p>
          ) : (
            <button
              type="button"
              className="button primary"
              disabled={buying || lot.status !== 'ACTIVE'}
              data-testid="buy-lot-button"
              onClick={() => void handleBuy()}
            >
              {buying
                ? 'Processing…'
                : availableMinor !== null && availableMinor < Number(lot.priceMinor)
                  ? 'Deposit & buy'
                  : 'Buy now'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
