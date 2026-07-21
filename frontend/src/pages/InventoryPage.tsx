import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  cancelLot,
  createLot,
  createLotsBulk,
  getAuthConfig,
  getInventory,
  getInventoryPriceHints,
  getPricingPreview,
  getUserMe,
  resetDevTrades,
  updateLotPrice,
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
import { InventoryGridSkeleton } from '../components/InventoryGridSkeleton';
import { InventorySellPanel } from '../components/InventorySellPanel';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { canShowDevPanels, parseUsdToMinor, ERROR_MESSAGES } from '../utils/format';
import { minorToPriceInput } from '../utils/inventory-pricing';
import { hasLinkedSteamId } from '../utils/steam-id';
import {
  canEditListedAsset,
  canListAsset,
  canOpenInventorySellPanel,
  filterInventoryAssets,
  getBulkListableSiblings,
  groupInventoryAssetsForDisplay,
  INVENTORY_SORT_OPTIONS,
  INVENTORY_STATUS_FILTERS,
  sortInventoryAssets,
  type InventorySortOption,
  type InventoryStatusFilter,
} from '../utils/seller-flow';
import { profileToAuthUser } from '../utils/user-profile';
import { hasTradeUrl } from '../utils/trade-url';
import { formatDataTimestamp } from '../utils/lot-display';

const STALE_INVENTORY_REVALIDATE_MS = 2_500;
const PRICE_HINT_REFRESH_BATCH = 8;

export function InventoryPage() {
  const { token, user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [resettingDevTrades, setResettingDevTrades] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sellError, setSellError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');
  const [sortOption, setSortOption] = useState<InventorySortOption>('price-desc');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bulkListCount, setBulkListCount] = useState(1);
  const [priceInput, setPriceInput] = useState('10.00');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceHints, setPriceHints] = useState<Record<string, InventoryPriceHint>>({});
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(null);
  const [steamPriceMissing, setSteamPriceMissing] = useState<string[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
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

  const selectedPriceHint = selectedAsset
    ? priceHints[selectedAsset.itemDefinition.marketHashName]
    : null;
  const selectedSteamPriceMissing =
    Boolean(selectedAsset) &&
    !pricesLoading &&
    !pricesRefreshing &&
    steamPriceMissing.includes(selectedAsset!.itemDefinition.marketHashName);

  const priceMinor = useMemo(() => parseUsdToMinor(priceInput), [priceInput]);
  const selectedListable = selectedAsset ? canListAsset(selectedAsset) : false;
  const selectedEditable = selectedAsset ? canEditListedAsset(selectedAsset) : false;
  const sellPanelMode = selectedEditable ? 'edit' : 'create';
  const sellPanelOpen =
    Boolean(selectedAsset) && (selectedListable || selectedEditable);

  const mergePriceHints = useCallback(
    (response: Awaited<ReturnType<typeof getInventoryPriceHints>>) => {
      setPriceHints((previous) => ({ ...previous, ...response.hints }));
      if (response.steamPriceFetchedAt) {
        setSteamPriceFetchedAt(response.steamPriceFetchedAt);
      }
    },
    [],
  );

  const loadPriceHints = useCallback(
    async (inventoryAssets: InventoryAsset[], forceRefresh = false) => {
      if (!token || inventoryAssets.length === 0) {
        setPriceHints({});
        setSteamPriceFetchedAt(null);
        setSteamPriceMissing([]);
        setPricesLoading(false);
        setPricesRefreshing(false);
        setPricesError(null);
        return;
      }

      const marketHashNames = [
        ...new Set(inventoryAssets.map((asset) => asset.itemDefinition.marketHashName)),
      ];
      setPricesError(null);

      if (forceRefresh) {
        setPricesLoading(true);
        setPricesRefreshing(false);
        try {
          const response = await getInventoryPriceHints(token, marketHashNames, {
            forceRefresh: true,
          });
          setPriceHints(response.hints);
          setSteamPriceFetchedAt(response.steamPriceFetchedAt ?? null);
          setSteamPriceMissing(response.steamPriceMissing ?? []);
        } catch (err: unknown) {
          setPriceHints({});
          setSteamPriceFetchedAt(null);
          setSteamPriceMissing([]);
          setPricesError(err);
        } finally {
          setPricesLoading(false);
        }
        return;
      }

      // 1) Unlock the grid from cache immediately.
      setPricesLoading(true);
      let missing: string[] = [];
      try {
        const cached = await getInventoryPriceHints(token, marketHashNames, {
          cacheOnly: true,
        });
        setPriceHints(cached.hints);
        setSteamPriceFetchedAt(cached.steamPriceFetchedAt ?? null);
        missing = cached.steamPriceMissing ?? [];
        setSteamPriceMissing(missing);
      } catch (err: unknown) {
        setPricesError(err);
        setPricesLoading(false);
        return;
      }
      setPricesLoading(false);

      if (missing.length === 0) {
        return;
      }

      // 2) Fill misses in small batches so one slow Steam call never blocks the UI.
      setPricesRefreshing(true);
      const stillMissing: string[] = [];
      try {
        for (let index = 0; index < missing.length; index += PRICE_HINT_REFRESH_BATCH) {
          const batch = missing.slice(index, index + PRICE_HINT_REFRESH_BATCH);
          try {
            const refreshed = await getInventoryPriceHints(token, batch);
            mergePriceHints(refreshed);
            stillMissing.push(...(refreshed.steamPriceMissing ?? []));
          } catch {
            stillMissing.push(...batch);
          }
        }
        setSteamPriceMissing(stillMissing);
      } finally {
        setPricesRefreshing(false);
      }
    },
    [token, mergePriceHints],
  );

  const scheduleStaleRevalidate = useCallback(
    (isStale: boolean) => {
      if (!token || !isStale) {
        setBackgroundSyncing(false);
        return;
      }
      setBackgroundSyncing(true);
      const revalidate = (attempt: number) => {
        window.setTimeout(() => {
          void getInventory(token)
            .then((response) => {
              setAssets(response.assets);
              setSync(response.sync);
              void loadPriceHints(response.assets);
              if (response.sync.stale && attempt < 2) {
                revalidate(attempt + 1);
                return;
              }
              setBackgroundSyncing(false);
            })
            .catch(() => {
              setBackgroundSyncing(false);
            });
        }, STALE_INVENTORY_REVALIDATE_MS);
      };
      revalidate(1);
    },
    [token, loadPriceHints],
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
        void loadPriceHints(response.assets);
        if (!forceRefresh) {
          scheduleStaleRevalidate(Boolean(response.sync.stale));
        } else {
          setBackgroundSyncing(false);
        }
      } catch (err: unknown) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, steamLinked, loadPriceHints, scheduleStaleRevalidate],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [profile, authConfig] = await Promise.all([
          getUserMe(token),
          getAuthConfig(),
        ]);
        if (cancelled) {
          return;
        }
        updateUser(profileToAuthUser(profile));
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
        void loadPriceHints(response.assets);
        scheduleStaleRevalidate(Boolean(response.sync.stale));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, updateUser, loadPriceHints, scheduleStaleRevalidate]);

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

  const showStaleBadge = Boolean(sync?.stale);

  const filteredAssets = useMemo(
    () =>
      sortInventoryAssets(
        filterInventoryAssets(assets, search, statusFilter, showUnavailable),
        priceHints,
        sortOption,
      ),
    [assets, search, statusFilter, showUnavailable, priceHints, sortOption],
  );

  const displayStacks = useMemo(
    () => groupInventoryAssetsForDisplay(filteredAssets),
    [filteredAssets],
  );

  const visibleCount = useMemo(
    () => filterInventoryAssets(assets, '', 'all', showUnavailable).length,
    [assets, showUnavailable],
  );

  function selectAsset(asset: InventoryAsset) {
    if (!canOpenInventorySellPanel(asset)) {
      return;
    }
    setSelectedAssetId(asset.id);
    setBulkListCount(1);
    setSellError(null);
    if (canEditListedAsset(asset) && asset.listedPriceMinor) {
      const listedMinor = Number(asset.listedPriceMinor);
      if (Number.isFinite(listedMinor) && listedMinor > 0) {
        setPriceInput(minorToPriceInput(listedMinor));
      }
    }
  }

  const clearSelection = useCallback(() => {
    setSelectedAssetId(null);
    setBulkListCount(1);
    setSellError(null);
    setCanceling(false);
  }, []);

  async function handleSubmitListing(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedAsset || !priceMinor) {
      setPriceError('Enter a valid price greater than zero.');
      return;
    }

    if (canEditListedAsset(selectedAsset)) {
      const lotId = selectedAsset.activeLotId;
      if (!lotId) {
        setSellError(new Error('Active listing not found for this item'));
        return;
      }
      setSubmitting(true);
      setSellError(null);
      try {
        await updateLotPrice(token, lotId, priceMinor);
        clearSelection();
        await loadInventory(false);
      } catch (err: unknown) {
        setSellError(err);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const quantity = Math.min(
      Math.max(1, bulkListCount),
      Math.max(1, bulkListTargets.length),
    );
    const useBulk = quantity >= 2 && bulkListTargets.length >= 2;
    const targetIds = useBulk
      ? bulkListTargets.slice(0, quantity).map((asset) => asset.id)
      : [selectedAsset.id];

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
        const refreshedSiblings = getBulkListableSiblings(
          freshAssets.assets,
          freshTargets[0]!,
        );
        const listingIds = refreshedSiblings
          .slice(0, quantity)
          .map((asset) => asset.id);
        if (listingIds.length !== quantity) {
          setSellError(new Error('Bulk listing set changed — refresh and try again'));
          return;
        }
        await createLotsBulk(token, listingIds, priceMinor);
      } else {
        const freshAsset = freshTargets[0];
        if (!freshAsset || !canListAsset(freshAsset)) {
          setSellError(new Error('This item cannot be listed right now'));
          return;
        }
        await createLot(token, freshAsset.id, priceMinor);
      }

      setSelectedAssetId(null);
      setBulkListCount(1);
      navigate('/deals?tab=listings');
    } catch (err: unknown) {
      setSellError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelListing() {
    if (!token || !selectedAsset?.activeLotId) {
      return;
    }
    setCanceling(true);
    setSellError(null);
    try {
      await cancelLot(token, selectedAsset.activeLotId);
      clearSelection();
      await loadInventory(false);
    } catch (err: unknown) {
      setSellError(err);
    } finally {
      setCanceling(false);
    }
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
        subtitle="Выберите предмет — выставить лот или изменить уже выставленный."
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

      <SellerSaleInfo compact />

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
          {sync.warning || sync.errorCode ? (
            <span>
              {' '}
              ·{' '}
              {(sync.errorCode && ERROR_MESSAGES[sync.errorCode]) ||
                sync.warning}
            </span>
          ) : null}
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

      {loading && steamLinked && tradeUrlReady ? (
        <div className="inventory-workspace">
          <div className="inventory-main">
            <p className="muted small" data-testid="inventory-loading-hint">
              Загрузка инвентаря…
            </p>
            <InventoryGridSkeleton />
          </div>
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
      assets.length > 0 ? (
        <div className="inventory-workspace">
          <div className="inventory-main">
            {backgroundSyncing ? (
              <p
                className="muted small inventory-price-inline"
                data-testid="inventory-background-sync"
              >
                Обновляем инвентарь из Steam в фоне…
              </p>
            ) : null}

            {pricesLoading || pricesRefreshing ? (
              <p className="muted small inventory-price-inline" data-testid="inventory-prices-loading">
                {pricesLoading ? 'Загрузка цен Steam…' : 'Уточняем цены Steam…'}
              </p>
            ) : null}

            {!pricesLoading && !pricesRefreshing && pricesError ? (
              <div
                className="inventory-price-banner inventory-price-banner-error"
                data-testid="inventory-prices-error"
              >
                <p className="muted small">Не удалось загрузить цены Steam.</p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-prices-retry"
                  onClick={() => void loadPriceHints(assets, true)}
                >
                  Повторить
                </button>
              </div>
            ) : null}

            {!pricesLoading && !pricesRefreshing && !pricesError && steamPriceMissing.length > 0 ? (
              <div
                className="inventory-price-banner"
                data-testid="inventory-prices-partial"
              >
                <p className="muted small">
                  Нет цен Steam у {steamPriceMissing.length}{' '}
                  {steamPriceMissing.length === 1 ? 'предмета' : 'предметов'} — выставить
                  можно только с ценой.
                </p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-prices-retry-partial"
                  onClick={() => void loadPriceHints(assets, true)}
                >
                  Повторить
                </button>
              </div>
            ) : null}

            <div className="inventory-toolbar" data-testid="inventory-filters">
              <div className="inventory-toolbar-fields">
                <label className="field catalog-filter-field inventory-toolbar-search">
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
                <label className="field catalog-filter-field">
                  <span className="field-label">Сортировка</span>
                  <select
                    value={sortOption}
                    onChange={(event) =>
                      setSortOption(event.target.value as InventorySortOption)
                    }
                    data-testid="inventory-sort"
                  >
                    {INVENTORY_SORT_OPTIONS.map((option) => (
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
                  <span className="muted small">Недоступные</span>
                </label>
              </div>
              <p className="muted small inventory-filter-total" data-testid="inventory-filter-total">
                Показано: {displayStacks.length}{' '}
                {displayStacks.length === 1 ? 'позиция' : 'позиций'}
                {filteredAssets.length !== displayStacks.length
                  ? ` (${filteredAssets.length} шт.)`
                  : null}{' '}
                из {visibleCount}
              </p>
            </div>

            {displayStacks.length === 0 ? (
              <EmptyState
                title="Ничего не найдено"
                message="Измените поиск или фильтр статуса."
              />
            ) : (
              <div className="inventory-grid" data-testid="inventory-grid">
                {displayStacks.map((stack) => {
                  const asset = stack.representative;
                  const stackSelected =
                    selectedAssetId != null &&
                    stack.assets.some((item) => item.id === selectedAssetId);
                  const stackBulkHighlighted =
                    stackSelected &&
                    bulkListCount >= 2 &&
                    bulkListTargets.length >= 2;
                  return (
                    <InventoryAssetCard
                      key={stack.key}
                      asset={asset}
                      isSelected={stackSelected}
                      isBulkHighlighted={stackBulkHighlighted}
                      stackCount={stack.count}
                      priceHint={priceHints[asset.itemDefinition.marketHashName]}
                      pricesLoading={
                        (pricesLoading || pricesRefreshing) &&
                        !priceHints[asset.itemDefinition.marketHashName]
                          ?.steamPriceMinor &&
                        !priceHints[asset.itemDefinition.marketHashName]
                          ?.minMarketplacePriceMinor
                      }
                      requireSteamPrice
                      onSelect={selectAsset}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {sellPanelOpen && selectedAsset ? (
        <>
          <button
            type="button"
            className="inventory-sell-backdrop"
            aria-label="Закрыть панель продажи"
            data-testid="inventory-sell-backdrop"
            onClick={clearSelection}
          />
          <div
            className="inventory-listing-overlay"
            data-testid="inventory-listing-overlay"
          >
            <div className="inventory-listing-overlay-dialog">
              <InventorySellPanel
                mode={sellPanelMode}
                asset={selectedAsset}
                priceHint={selectedPriceHint}
                steamPriceMissing={selectedSteamPriceMissing}
                priceInput={priceInput}
                priceError={priceError}
                preview={preview}
                sellError={sellError}
                submitting={submitting}
                canceling={canceling}
                priceMinor={priceMinor}
                bulkListableCount={
                  sellPanelMode === 'edit' ? 1 : bulkListTargets.length
                }
                bulkListCount={bulkListCount}
                stackCount={sellPanelMode === 'edit' ? 1 : bulkListTargets.length}
                onBulkListCountChange={setBulkListCount}
                onPriceChange={setPriceInput}
                onSubmit={(event) => void handleSubmitListing(event)}
                onCancelListing={
                  sellPanelMode === 'edit'
                    ? () => void handleCancelListing()
                    : undefined
                }
                onClose={clearSelection}
              />
            </div>
          </div>
        </>
      ) : null}

    </div>
  );
}
