import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createLot,
  createLotsBulk,
  getAuthConfig,
  getInventory,
  getInventoryPriceHints,
  getPricingPreview,
  getUserMe,
  resetDevTrades,
} from '../api/sell';
import type {
  AuthConfig,
  InventoryAsset,
  InventoryPriceHint,
  InventorySyncMeta,
  PricingPreview,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryAssetCard } from '../components/InventoryAssetCard';
import { InventorySellPanel } from '../components/InventorySellPanel';
import { InventorySellPlaceholder } from '../components/InventorySellPlaceholder';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { canShowDevPanels, parseUsdToMinor } from '../utils/format';
import { hasLinkedSteamId } from '../utils/steam-id';
import {
  canListAsset,
  filterInventoryAssets,
  getBulkListableSiblings,
  INVENTORY_STATUS_FILTERS,
  sortInventoryAssetsBySteamPriceDesc,
  type InventoryStatusFilter,
} from '../utils/seller-flow';
import { profileToAuthUser } from '../utils/user-profile';
import { hasTradeUrl } from '../utils/trade-url';
import { formatDataTimestamp } from '../utils/lot-display';

export function InventoryPage() {
  const { token, user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingDevTrades, setResettingDevTrades] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sellError, setSellError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bulkListAll, setBulkListAll] = useState(false);
  const [priceInput, setPriceInput] = useState('10.00');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceHints, setPriceHints] = useState<Record<string, InventoryPriceHint>>({});
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState<unknown>(null);

  const inventoryProvider = config?.inventoryProvider ?? 'mock';
  const requiresSteamLink = inventoryProvider === 'steam';
  const steamLinked = !requiresSteamLink || hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = hasTradeUrl(user?.tradeUrl);
  const showDevReset =
    Boolean(config?.mockTradeEnabled) && canShowDevPanels(user?.role);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const bulkListTargets = useMemo(() => {
    if (!selectedAsset) {
      return [];
    }
    return getBulkListableSiblings(assets, selectedAsset);
  }, [assets, selectedAsset]);

  const bulkHighlightIds = useMemo(() => {
    if (!selectedAsset || !bulkListAll || bulkListTargets.length < 2) {
      return new Set<string>();
    }
    return new Set(bulkListTargets.map((asset) => asset.id));
  }, [selectedAsset, bulkListAll, bulkListTargets]);

  const priceMinor = useMemo(() => parseUsdToMinor(priceInput), [priceInput]);
  const selectedListable = selectedAsset ? canListAsset(selectedAsset) : false;

  const loadPriceHints = useCallback(
    async (inventoryAssets: InventoryAsset[]) => {
      if (!token || inventoryAssets.length === 0) {
        setPriceHints({});
        setSteamPriceFetchedAt(null);
        setPricesLoading(false);
        setPricesError(null);
        return;
      }

      const marketHashNames = [
        ...new Set(inventoryAssets.map((asset) => asset.itemDefinition.marketHashName)),
      ];
      setPricesLoading(true);
      setPricesError(null);
      try {
        const response = await getInventoryPriceHints(token, marketHashNames);
        setPriceHints(response.hints);
        setSteamPriceFetchedAt(response.steamPriceFetchedAt ?? null);
      } catch (err: unknown) {
        setPriceHints({});
        setSteamPriceFetchedAt(null);
        setPricesError(err);
      } finally {
        setPricesLoading(false);
      }
    },
    [token],
  );

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
        await loadPriceHints(response.assets);
      } catch (err: unknown) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, steamLinked, loadPriceHints],
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
          setError(null);
          return;
        }
        const response = await getInventory(token);
        if (cancelled) {
          return;
        }
        setAssets(response.assets);
        setSync(response.sync);
        await loadPriceHints(response.assets);
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
  }, [token, updateUser, loadPriceHints]);

  useEffect(() => {
    if (!priceMinor) {
      setPreview(null);
      setPriceError('Enter a valid price greater than zero.');
      return;
    }
    setPriceError(null);
    getPricingPreview(priceMinor)
      .then(setPreview)
      .catch((err: unknown) => setSellError(err));
  }, [priceMinor]);

  useEffect(() => {
    if (!selectedAssetId) {
      return;
    }
    const stillExists = assets.some((asset) => asset.id === selectedAssetId);
    if (!stillExists) {
      setSelectedAssetId(null);
    }
  }, [assets, selectedAssetId]);

  const showStaleBadge =
    sync?.stale || (sync ? new Date(sync.expiresAt) <= new Date() : false);

  const filteredAssets = useMemo(
    () =>
      sortInventoryAssetsBySteamPriceDesc(
        filterInventoryAssets(assets, search, statusFilter, showUnavailable),
        priceHints,
      ),
    [assets, search, statusFilter, showUnavailable, priceHints],
  );

  const visibleCount = useMemo(
    () => filterInventoryAssets(assets, '', 'all', showUnavailable).length,
    [assets, showUnavailable],
  );

  function selectAsset(asset: InventoryAsset) {
    if (!canListAsset(asset)) {
      return;
    }
    setSelectedAssetId(asset.id);
    setBulkListAll(false);
    setSellError(null);
  }

  async function handleSubmitListing(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedAssetId || !priceMinor) {
      setPriceError('Enter a valid price greater than zero.');
      return;
    }

    const useBulk =
      bulkListAll && bulkListTargets.length >= 2 && selectedAssetId != null;
    const targetIds = useBulk
      ? bulkListTargets.map((asset) => asset.id)
      : [selectedAssetId];

    setSubmitting(true);
    setSellError(null);
    try {
      const freshAssets = await getInventory(token);
      const freshTargets = targetIds
        .map((id) => freshAssets.assets.find((asset) => asset.id === id))
        .filter((asset): asset is InventoryAsset => Boolean(asset));

      if (freshTargets.length !== targetIds.length) {
        setSellError(new Error('Some selected items are no longer in inventory'));
        return;
      }

      if (useBulk) {
        const refreshedSiblings = getBulkListableSiblings(freshAssets.assets, freshTargets[0]!);
        if (refreshedSiblings.length !== targetIds.length) {
          setSellError(new Error('Bulk listing set changed — refresh and try again'));
          return;
        }
        await createLotsBulk(
          token,
          refreshedSiblings.map((asset) => asset.id),
          priceMinor,
        );
      } else {
        const freshAsset = freshTargets[0];
        if (!freshAsset || !canListAsset(freshAsset)) {
          setSellError(new Error('This item cannot be listed right now'));
          return;
        }
        await createLot(token, freshAsset.id, priceMinor);
      }

      setSelectedAssetId(null);
      setBulkListAll(false);
      navigate('/deals?tab=listings');
    } catch (err: unknown) {
      setSellError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function clearSelection() {
    setSelectedAssetId(null);
    setBulkListAll(false);
    setSellError(null);
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
    <div className="page inventory-page">
      <PageHeader
        title="Инвентарь"
        subtitle="Выберите предмет в сетке и укажите цену в панели продажи."
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
          {formatDataTimestamp(steamPriceFetchedAt) ? (
            <span> · Цены Steam: {formatDataTimestamp(steamPriceFetchedAt)}</span>
          ) : null}
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
        <div className="card inventory-readiness-banner" data-testid="inventory-trade-url-warning">
          <p>
            Укажите Trade URL в{' '}
            <Link to="/account">настройках аккаунта</Link> — без него нельзя выставлять предметы.
          </p>
          <Link className="button primary" to="/account">
            Перейти в аккаунт
          </Link>
        </div>
      ) : null}

      {loading ? <LoadingState message="Загрузка инвентаря…" /> : null}

      {!loading && pricesLoading ? (
        <LoadingState message="Загрузка актуальных цен Steam…" />
      ) : null}

      {!loading && !pricesLoading && pricesError ? (
        <div className="card inventory-price-error" data-testid="inventory-prices-error">
          <ErrorAlert error={pricesError} />
          <button
            type="button"
            className="button secondary"
            data-testid="inventory-prices-retry"
            onClick={() => void loadPriceHints(assets)}
          >
            Повторить загрузку цен
          </button>
        </div>
      ) : null}

      {steamLinked && tradeUrlReady && !loading && assets.length === 0 ? (
        <EmptyState
          title="Инвентарь пуст"
          message="Предметы не найдены. Попробуйте обновить синхронизацию."
        />
      ) : null}

      {steamLinked &&
      tradeUrlReady &&
      !loading &&
      !pricesLoading &&
      !pricesError &&
      assets.length > 0 ? (
        <div
          className={`inventory-workspace${
            selectedAsset && selectedListable ? ' inventory-workspace-panel-open' : ''
          }`}
        >
          {selectedAsset && selectedListable ? (
            <button
              type="button"
              className="inventory-sell-backdrop"
              aria-label="Закрыть панель продажи"
              data-testid="inventory-sell-backdrop"
              onClick={clearSelection}
            />
          ) : null}
          <div className="inventory-main">
            <div className="inventory-toolbar" data-testid="inventory-filters">
              <div className="inventory-toolbar-fields">
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
                <label className="inventory-show-unavailable">
                  <input
                    type="checkbox"
                    checked={showUnavailable}
                    onChange={(event) => setShowUnavailable(event.target.checked)}
                    data-testid="inventory-show-unavailable"
                  />
                  <span className="muted small">Показать недоступные</span>
                </label>
              </div>
              <p className="muted small inventory-filter-total" data-testid="inventory-filter-total">
                Показано: {filteredAssets.length} из {visibleCount}
              </p>
            </div>

            {filteredAssets.length === 0 ? (
              <EmptyState
                title="Ничего не найдено"
                message="Измените поиск или фильтр статуса."
              />
            ) : (
              <div className="inventory-grid">
                {filteredAssets.map((asset) => (
                  <InventoryAssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAssetId === asset.id}
                    isBulkHighlighted={bulkHighlightIds.has(asset.id)}
                    priceHint={priceHints[asset.itemDefinition.marketHashName]}
                    pricesLoading={pricesLoading}
                    requireSteamPrice
                    onSelect={selectAsset}
                  />
                ))}
              </div>
            )}
          </div>

          <aside
            className={`inventory-sidebar${
              selectedAsset && selectedListable ? ' inventory-sidebar-active' : ''
            }`}
          >
            {selectedAsset && selectedListable ? (
              <InventorySellPanel
                asset={selectedAsset}
                priceHint={priceHints[selectedAsset.itemDefinition.marketHashName]}
                priceInput={priceInput}
                priceError={priceError}
                preview={preview}
                sellError={sellError}
                submitting={submitting}
                priceMinor={priceMinor}
                bulkListableCount={bulkListTargets.length}
                bulkListAll={bulkListAll}
                onBulkListAllChange={setBulkListAll}
                onPriceChange={setPriceInput}
                onSubmit={(event) => void handleSubmitListing(event)}
                onClose={clearSelection}
                showClose
              />
            ) : (
              <InventorySellPlaceholder />
            )}
          </aside>
        </div>
      ) : null}

      <SellerSaleInfo />
    </div>
  );
}
