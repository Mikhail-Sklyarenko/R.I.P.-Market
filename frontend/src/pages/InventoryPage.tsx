import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthConfig, getInventory, getMyLots, getUserMe, resetDevTrades } from '../api/sell';
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
  filterInventoryAssets,
  formatAssetStatus,
  INVENTORY_STATUS_FILTERS,
  type InventoryStatusFilter,
} from '../utils/seller-flow';
import { profileToAuthUser } from '../utils/user-profile';
import { canShowDevPanels } from '../utils/format';

export function InventoryPage() {
  const { token, user, updateUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [myLots, setMyLots] = useState<Lot[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingDevTrades, setResettingDevTrades] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');

  const inventoryProvider = config?.inventoryProvider ?? 'mock';
  const requiresSteamLink = inventoryProvider === 'steam';
  const steamLinked = !requiresSteamLink || hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = Boolean(user?.tradeUrl?.trim());
  const showDevReset =
    Boolean(config?.mockTradeEnabled) && canShowDevPanels(user?.role);

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

    getUserMe(token)
      .then(async (profile) => {
        if (cancelled) {
          return;
        }
        updateUser(profileToAuthUser(profile));
        const authConfig = await getAuthConfig();
        setConfig(authConfig);
        const linked =
          authConfig.inventoryProvider !== 'steam' ||
          hasLinkedSteamId(profile.steamId);
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

  const filteredAssets = useMemo(
    () => filterInventoryAssets(assets, search, statusFilter),
    [assets, search, statusFilter],
  );

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
          Выставить
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
        Недоступен
      </button>
    );
  }

  async function handleResetDevTrades() {
    if (!token) {
      return;
    }
    setResettingDevTrades(true);
    setError(null);
    try {
      const result = await resetDevTrades(token);
      if (!result.ok) {
        throw new Error(result.reason ?? 'reset_failed');
      }
      await loadInventory(true);
    } catch (err: unknown) {
      setError(err);
    } finally {
      setResettingDevTrades(false);
    }
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
            {refreshing ? 'Обновление…' : 'Обновить из Steam'}
          </button>
        }
      />

      {!steamLinked && requiresSteamLink ? (
        <p className="muted small" data-testid="inventory-refresh-hint">
          Обновление недоступно: сначала привяжите Steam в настройках аккаунта.
        </p>
      ) : null}

      {showDevReset && token ? (
        <div className="dev-panel" data-testid="inventory-dev-reset-panel">
          <p className="muted small">
            После тестовых mock-сделок предметы могут остаться в статусе «Продан».
            Сброс вернёт их в «Доступен» и отменит зависшие сделки.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={resettingDevTrades || loading || refreshing}
            data-testid="inventory-reset-dev-trades"
            onClick={() => void handleResetDevTrades()}
          >
            {resettingDevTrades ? 'Сброс…' : 'Сбросить тестовые сделки'}
          </button>
        </div>
      ) : null}

      {sync ? (
        <p className="muted small">
          Последняя синхронизация: {new Date(sync.lastSyncedAt).toLocaleString()}
          {showStaleBadge ? (
            <span className="badge badge-stale" style={{ marginLeft: '0.5rem' }}>
              Устарело
            </span>
          ) : null}
          {sync.warning ? <span> · {sync.warning}</span> : null}
        </p>
      ) : null}

      <ErrorAlert error={error} />

      {!steamLinked && requiresSteamLink ? (
        <div className="card inventory-readiness-banner" data-testid="steam-link-required">
          <p>
            Сначала привяжите Steam и укажите Trade URL — без этого инвентарь и обмены недоступны.
          </p>
          <Link className="button primary" to="/account">
            Перейти в аккаунт
          </Link>
        </div>
      ) : null}

      {steamLinked && !tradeUrlReady ? (
        <div className="alert alert-warning" data-testid="inventory-trade-url-warning">
          <strong>Trade URL не указан</strong>
          <p className="alert-body">
            Перед выставлением предметов укажите Trade URL в настройках аккаунта — продавцам и
            покупателям он нужен для обменов в Steam.
          </p>
          <Link className="button secondary sm" to="/account">
            Указать Trade URL
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

      {steamLinked && !loading && assets.length > 0 ? (
        <div className="card inventory-filters" data-testid="inventory-filters">
          <div className="inventory-filters-row">
            <label className="field catalog-filter-field">
              <span className="field-label">Поиск</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название скина…"
                data-testid="inventory-search"
              />
            </label>
            <label className="field catalog-filter-field">
              <span className="field-label">Статус</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as InventoryStatusFilter)
                }
                data-testid="inventory-status-filter"
              >
                {INVENTORY_STATUS_FILTERS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small inventory-filter-total" data-testid="inventory-filter-total">
            Показано: {filteredAssets.length} из {assets.length}
          </p>
        </div>
      ) : null}

      {steamLinked && !loading && assets.length > 0 && filteredAssets.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          message="Измените поиск или фильтр статуса."
        />
      ) : null}

      <div className="grid">
        {steamLinked
          ? filteredAssets.map((asset) => {
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
                      <dt>Обмен</dt>
                      <dd>{asset.tradable ? 'Да' : 'Нет'}</dd>
                    </div>
                  </dl>
                  {!listable ? (
                    <p className="muted small">{assetUnavailableReason(asset)}</p>
                  ) : null}
                  {listable && steamLinked && !tradeUrlReady ? (
                    <p className="muted small inventory-list-trade-url-hint">
                      Рекомендуем указать Trade URL в аккаунте перед выставлением лота.
                    </p>
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
