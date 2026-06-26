import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listActiveLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor } from '../utils/format';

export function CatalogPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLoading(true);
    listActiveLots()
      .then(setLots)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Catalog</h2>
          <p className="muted">Active listings available for purchase.</p>
        </div>
      </div>

      <ErrorAlert error={error} />

      {loading ? <p className="muted">Loading catalog…</p> : null}

      {!loading && lots.length === 0 ? (
        <div className="card">
          <p>No active listings yet. A seller needs to list items first.</p>
        </div>
      ) : null}

      <div className="grid" data-testid="catalog-grid">
        {lots.map((lot) => (
          <article key={lot.id} className="card item-card" data-testid={`catalog-lot-${lot.id}`}>
            <div className="item-card-header">
              <h3>{lot.inventoryAsset.itemDefinition.marketHashName}</h3>
              <span className="badge badge-active">{lot.status}</span>
            </div>
            <p className="muted">{lot.inventoryAsset.wear ?? 'Unknown wear'}</p>
            <p>
              <strong>{formatUsdFromMinor(lot.priceMinor)}</strong>
            </p>
            <Link className="button primary" to={`/lots/${lot.id}`}>
              View listing
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
