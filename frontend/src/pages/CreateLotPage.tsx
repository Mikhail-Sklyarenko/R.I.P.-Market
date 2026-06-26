import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createLot, getInventory, getPricingPreview } from '../api/sell';
import type { InventoryAsset, PricingPreview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor, parseUsdToMinor } from '../utils/format';

export function CreateLotPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get('assetId');

  const [asset, setAsset] = useState<InventoryAsset | null>(null);
  const [priceInput, setPriceInput] = useState('10.00');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const priceMinor = useMemo(() => parseUsdToMinor(priceInput), [priceInput]);

  const listable = useMemo(() => {
    if (!asset) {
      return false;
    }
    if (asset.status !== 'AVAILABLE' || !asset.tradable) {
      return false;
    }
    if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
      return false;
    }
    return true;
  }, [asset]);

  useEffect(() => {
    if (!token || !assetId) {
      return;
    }
    setLoading(true);
    getInventory(token)
      .then((response) => {
        const found = response.assets.find((item) => item.id === assetId) ?? null;
        setAsset(found);
        if (!found) {
          setError(new Error('Inventory item not found'));
        }
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, assetId]);

  useEffect(() => {
    if (!priceMinor) {
      setPreview(null);
      setFieldError('Enter a valid price greater than zero.');
      return;
    }
    setFieldError(null);
    getPricingPreview(priceMinor)
      .then(setPreview)
      .catch((err: unknown) => setError(err));
  }, [priceMinor]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !assetId || !priceMinor) {
      setFieldError('Enter a valid price greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createLot(token, assetId, priceMinor);
      navigate('/sell/my-lots');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assetId) {
    return (
      <div className="page">
        <div className="card">
          <p>Missing asset. Go back to inventory and pick an item.</p>
          <Link to="/sell/inventory">Back to inventory</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Create listing</h2>
          <p className="muted">Set your price and review commission before publishing.</p>
        </div>
        <Link to="/sell/inventory" className="button secondary">
          Back
        </Link>
      </div>

      {loading ? <p className="muted">Loading item…</p> : null}

      {asset ? (
        <form className="card form-card" onSubmit={(event) => void handleSubmit(event)}>
          <h3>{asset.itemDefinition.marketHashName}</h3>
          <p className="muted">{asset.wear ?? 'Unknown wear'}</p>
          {!listable ? (
            <p className="field-error">
              This item cannot be listed right now (not tradable or trade-locked).
            </p>
          ) : null}

          <label className="field">
            <span>Price (USD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              data-testid="price-input"
            />
          </label>

          {fieldError ? <p className="field-error">{fieldError}</p> : null}

          {preview ? (
            <div className="pricing-preview" data-testid="pricing-preview">
              <div>
                <span>List price</span>
                <strong>{formatUsdFromMinor(preview.priceMinor)}</strong>
              </div>
              <div>
                <span>Commission (5%)</span>
                <strong>{formatUsdFromMinor(preview.commissionMinor)}</strong>
              </div>
              <div>
                <span>You receive</span>
                <strong>{formatUsdFromMinor(preview.sellerReceiveMinor)}</strong>
              </div>
            </div>
          ) : null}

          <ErrorAlert error={error} />

          <button
            type="submit"
            className="button primary"
            disabled={submitting || !priceMinor || !!fieldError || !listable}
            data-testid="submit-listing"
          >
            {submitting ? 'Publishing…' : 'Publish listing'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
