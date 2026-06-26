import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthConfig, getAuthMe, getInventory } from '../api/sell';
import type { AuthConfig, InventoryAsset, InventorySyncMeta } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { hasLinkedSteamId } from '../utils/steam-id';

function canList(asset: InventoryAsset): boolean {
  if (asset.status !== 'AVAILABLE') {
    return false;
  }
  if (!asset.tradable) {
    return false;
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return false;
  }
  return true;
}

function unavailableReason(asset: InventoryAsset): string {
  if (asset.status !== 'AVAILABLE') {
    return `Status: ${asset.status}`;
  }
  if (!asset.tradable) {
    return 'Not tradable';
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return `Trade-locked until ${new Date(asset.tradeLockUntil).toLocaleString()}`;
  }
  return 'Unavailable';
}

export function InventoryPage() {
  const { token, user, updateUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const inventoryProvider = config?.inventoryProvider ?? 'mock';
  const requiresSteamLink = inventoryProvider === 'steam';
  const steamLinked = !requiresSteamLink || hasLinkedSteamId(user?.steamId);

  const loadInventory = useCallback(
    async (forceRefresh = false) => {
      if (!token || !steamLinked) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const response = await getInventory(token, { forceRefresh });
        setAssets(response.assets);
        setSync(response.sync);
      } catch (err: unknown) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, steamLinked],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    getAuthMe(token)
      .then(async (sessionUser) => {
        if (cancelled) {
          return;
        }
        updateUser(sessionUser);
        const authConfig = await getAuthConfig();
        setConfig(authConfig);
        const linked =
          authConfig.inventoryProvider !== 'steam' ||
          hasLinkedSteamId(sessionUser.steamId);
        if (!linked) {
          setAssets([]);
          setSync(null);
          setError(null);
          return;
        }
        const response = await getInventory(token);
        if (cancelled) {
          return;
        }
        setAssets(response.assets);
        setSync(response.sync);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, updateUser]);

  const showStaleBadge =
    sync?.stale || (sync ? new Date(sync.expiresAt) <= new Date() : false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Inventory</h2>
          <p className="muted">Choose an item to list on the marketplace.</p>
          {sync ? (
            <p className="muted small">
              Last synced: {new Date(sync.lastSyncedAt).toLocaleString()}
              {showStaleBadge ? (
                <span className="badge badge-stale" style={{ marginLeft: '0.5rem' }}>
                  Stale
                </span>
              ) : null}
              {sync.warning ? <span> · {sync.warning}</span> : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={loading || refreshing || !steamLinked}
          data-testid="inventory-refresh"
          onClick={() => void loadInventory(true)}
        >
          {refreshing ? 'Refreshing…' : 'Refresh from Steam'}
        </button>
      </div>

      <ErrorAlert error={error} />

      {!steamLinked && requiresSteamLink ? (
        <div className="card" data-testid="steam-link-required">
          <p>
            Link your Steam account to load real inventory from Steam.
          </p>
          <Link className="button primary" to="/account">
            Go to Account
          </Link>
        </div>
      ) : null}

      {loading ? <p className="muted">Loading inventory…</p> : null}

      {steamLinked && !loading && assets.length === 0 ? (
        <div className="card">
          <p>No inventory items found.</p>
        </div>
      ) : null}

      <div className="grid">
        {steamLinked
          ? assets.map((asset) => {
          const listable = canList(asset);
          return (
            <article key={asset.id} className="card item-card" data-testid={`asset-${asset.id}`}>
              <div className="item-card-header">
                <h3>{asset.itemDefinition.marketHashName}</h3>
                <span className={`badge badge-${asset.status.toLowerCase()}`}>{asset.status}</span>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>Wear</dt>
                  <dd>{asset.wear ?? '—'}</dd>
                </div>
                <div>
                  <dt>Tradable</dt>
                  <dd>{asset.tradable ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
              {!listable ? <p className="muted small">{unavailableReason(asset)}</p> : null}
              {listable ? (
                <Link
                  className="button primary"
                  to={`/sell/lots/new?assetId=${asset.id}`}
                  data-testid={`list-asset-${asset.id}`}
                >
                  List item
                </Link>
              ) : (
                <button type="button" className="button" disabled title={unavailableReason(asset)}>
                  Cannot list
                </button>
              )}
            </article>
          );
        })
          : null}
      </div>
    </div>
  );
}
