import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthConfig, getAuthMe, getInventory, getMyLots } from '../api/sell';
import type { AuthConfig, InventoryAsset, InventorySyncMeta, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { StatusBadge } from '../components/StatusBadge';
import { hasLinkedSteamId } from '../utils/steam-id';
import {
  assetUnavailableReason,
  canListAsset,
  formatAssetStatus,
} from '../utils/seller-flow';

export function InventoryPage() {
  const { token, user, updateUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [myLots, setMyLots] = useState<Lot[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const inventoryProvider = config?.inventoryProvider ?? 'mock';
  const requiresSteamLink = inventoryProvider === 'steam';
  const steamLinked = !requiresSteamLink || hasLinkedSteamId(user?.steamId);

  const lotByAssetId = useMemo(() => {
    const map = new Map<string, Lot>();
    for (const lot of myLots) {
      map.set(lot.inventoryAsset.id, lot);
    }
    return map;
  }, [myLots]);

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
        const [response, lots] = await Promise.all([
          getInventory(token, { forceRefresh }),
          getMyLots(token),
        ]);
        setAssets(response.assets);
        setSync(response.sync);
        setMyLots(lots);
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
          setMyLots([]);
          setError(null);
          return;
        }
        const [response, lots] = await Promise.all([
          getInventory(token),
          getMyLots(token),
        ]);
        if (cancelled) {
          return;
        }
        setAssets(response.assets);
        setSync(response.sync);
        setMyLots(lots);
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

  function renderAssetAction(asset: InventoryAsset) {
    const listable = canListAsset(asset);
    const activeLot = lotByAssetId.get(asset.id);

    if (listable) {
      return (
        <Link
          className="button primary"
          to={`/sell/lots/new?assetId=${asset.id}`}
          data-testid={`list-asset-${asset.id}`}
        >
          List item
        </Link>
      );
    }

    if (asset.status === 'LISTED' && activeLot) {
      return (
        <Link
          className="button secondary"
          to="/sell/my-lots"
          data-testid={`view-lot-${asset.id}`}
        >
          Активный лот
        </Link>
      );
    }

    return (
      <button
        type="button"
        className="button"
        disabled
        title={assetUnavailableReason(asset)}
      >
        Cannot list
      </button>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Инвентарь"
        subtitle="Выберите предмет для выставления на маркетплейс."
        actions={
          <button
            type="button"
            className="button secondary"
            disabled={loading || refreshing || !steamLinked}
            data-testid="inventory-refresh"
            onClick={() => void loadInventory(true)}
          >
            {refreshing ? 'Refreshing…' : 'Refresh from Steam'}
          </button>
        }
      />

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

      <ErrorAlert error={error} />

      {!steamLinked && requiresSteamLink ? (
        <div className="card" data-testid="steam-link-required">
          <p>Привяжите Steam-аккаунт, чтобы загрузить инвентарь.</p>
          <Link className="button primary" to="/account">
            Перейти в аккаунт
          </Link>
        </div>
      ) : null}

      {loading ? <LoadingState message="Загрузка инвентаря…" /> : null}

      {steamLinked && !loading && assets.length === 0 ? (
        <EmptyState
          title="Инвентарь пуст"
          message="Предметы не найдены. Попробуйте обновить синхронизацию."
        />
      ) : null}

      <div className="grid">
        {steamLinked
          ? assets.map((asset) => {
              const listable = canListAsset(asset);
              return (
                <article
                  key={asset.id}
                  className="card item-card"
                  data-testid={`asset-${asset.id}`}
                >
                  <ItemPreview
                    item={asset}
                    title={asset.itemDefinition.marketHashName}
                    size="sm"
                  />
                  <div className="item-card-header">
                    <StatusBadge
                      status={asset.status}
                      label={formatAssetStatus(asset.status)}
                    />
                  </div>
                  <dl className="meta-list">
                    <div>
                      <dt>Tradable</dt>
                      <dd>{asset.tradable ? 'Yes' : 'No'}</dd>
                    </div>
                  </dl>
                  {!listable ? (
                    <p className="muted small">{assetUnavailableReason(asset)}</p>
                  ) : null}
                  {renderAssetAction(asset)}
                </article>
              );
            })
          : null}
      </div>

      <SellerSaleInfo />
    </div>
  );
}
