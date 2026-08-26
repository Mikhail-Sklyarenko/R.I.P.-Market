import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  cancelLot,
  createLot,
  createLotsBulk,
  getAuthConfig,
  getInventory,
  getInventoryPriceHintsBatched,
  getMyLots,
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
import { useLocale } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryAssetCard } from '../components/InventoryAssetCard';
import { InventoryGridSkeleton } from '../components/InventoryGridSkeleton';
import { InventorySellPanel } from '../components/InventorySellPanel';
import { InventorySellerOnboarding } from '../components/InventorySellerOnboarding';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { ExtensionAwareCommerceHint } from '../components/ExtensionAwareCommerceHint';
import { canShowDevPanels, parseUsdToMinor, ERROR_MESSAGES } from '../utils/format';
import { formatDataTimestamp } from '../utils/lot-display';
import { getRecommendedPriceMinor, minorToPriceInput, shouldAutofillListingPrice } from '../utils/inventory-pricing';
import { hasLinkedSteamId } from '../utils/steam-id';
import {
  canEditListedAsset,
  canListAsset,
  canOpenInventorySellPanel,
  filterInventoryAssets,
  getBulkListableSiblings,
  groupInventoryAssetsForDisplay,
  INVENTORY_SORT_OPTION_IDS,
  INVENTORY_STATUS_FILTER_IDS,
  inventorySortOptionLabelKey,
  isInventoryAssetVisible,
  sortInventoryAssets,
  type InventorySortOption,
  type InventoryStatusFilter,
} from '../utils/seller-flow';
import { profileToAuthUser } from '../utils/user-profile';
import { hasTradeUrl } from '../utils/trade-url';
import { readInventorySession, writeInventorySession } from '../utils/inventory-session-cache';
import {
  INVENTORY_PRICE_HINTS_REFRESH_BATCH,
  hasAnySteamPrice,
  listableNamesMissingSteamPrice,
  namesMissingSteamPrice,
  uniqueMarketHashNames,
} from '../utils/inventory-price-hints';
import { formatInventoryFilterTotal } from '../utils/inventory-filter-total';
import {
  decideInventorySyncPoll,
  nextInventorySyncPollDelayMs,
} from '../utils/inventory-sync-poll';
import {
  inventoryEmptyKindMessageKeys,
  resolveInventoryEmptyKind,
} from '../utils/inventory-empty-state';
import {
  isSellerOnboardingMarkedComplete,
  markSellerOnboardingComplete,
} from '../utils/seller-onboarding';

export function InventoryPage() {
  const { locale, t } = useLocale();
  const { token, user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [sync, setSync] = useState<InventorySyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [syncPollTimedOut, setSyncPollTimedOut] = useState(false);
  const inventorySyncPollRef = useRef(0);
  const [resettingDevTrades, setResettingDevTrades] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sellError, setSellError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');
  const [sortOption, setSortOption] = useState<InventorySortOption>('price-desc');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bulkListCount, setBulkListCount] = useState(1);
  const [priceInput, setPriceInput] = useState('');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceDirty, setPriceDirty] = useState(false);
  const [priceHints, setPriceHints] = useState<Record<string, InventoryPriceHint>>({});
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(null);
  const [steamPriceMissing, setSteamPriceMissing] = useState<string[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
  const [pricesError, setPricesError] = useState<unknown>(null);
  const [hasListedBefore, setHasListedBefore] = useState(isSellerOnboardingMarkedComplete);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const priceHintsRef = useRef<Record<string, InventoryPriceHint>>({});
  const priceHintsGenerationRef = useRef(0);
  const steamPriceMissingRef = useRef<string[]>([]);
  priceHintsRef.current = priceHints;
  steamPriceMissingRef.current = steamPriceMissing;

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
  const steamPricesLoading = pricesLoading || pricesRefreshing;
  const selectedSteamPriceMissing =
    Boolean(selectedAsset) &&
    !steamPricesLoading &&
    namesMissingSteamPrice(
      [selectedAsset!.itemDefinition.marketHashName],
      priceHints,
    ).length > 0;

  const priceMinor = useMemo(() => parseUsdToMinor(priceInput), [priceInput]);
  const selectedListable = selectedAsset ? canListAsset(selectedAsset) : false;
  const selectedEditable = selectedAsset ? canEditListedAsset(selectedAsset) : false;
  const sellPanelMode = selectedEditable ? 'edit' : 'create';
  const sellPanelOpen =
    Boolean(selectedAsset) && (selectedListable || selectedEditable);

  const loadPriceHints = useCallback(
    async (inventoryAssets: InventoryAsset[], forceRefresh = false) => {
      if (!token || inventoryAssets.length === 0) {
        priceHintsRef.current = {};
        setPriceHints({});
        setSteamPriceFetchedAt(null);
        setSteamPriceMissing([]);
        setPricesLoading(false);
        setPricesRefreshing(false);
        setPricesError(null);
        return;
      }

      const generation = ++priceHintsGenerationRef.current;
      const stillCurrent = () => generation === priceHintsGenerationRef.current;
      const marketHashNames = uniqueMarketHashNames(inventoryAssets);
      const retryTargets = steamPriceMissingRef.current;
      const retryOnlyMissing =
        forceRefresh &&
        hasAnySteamPrice(priceHintsRef.current) &&
        retryTargets.length > 0;

      if (retryOnlyMissing) {
        setPricesLoading(false);
        setPricesRefreshing(true);
      } else {
        setPricesLoading(true);
        setPricesRefreshing(false);
      }

      const applyHints = (
        patch: Record<string, InventoryPriceHint>,
        fetchedAt: string | null | undefined,
        missingScope: string[],
      ) => {
        if (!stillCurrent()) {
          return;
        }
        const next = { ...priceHintsRef.current, ...patch };
        priceHintsRef.current = next;
        setPriceHints(next);
        if (fetchedAt) {
          setSteamPriceFetchedAt(fetchedAt);
        }
        const nextMissing = listableNamesMissingSteamPrice(
          inventoryAssets,
          namesMissingSteamPrice(missingScope, next),
        );
        steamPriceMissingRef.current = nextMissing;
        setSteamPriceMissing(nextMissing);
      };

      setPricesError(null);

      if (retryOnlyMissing) {
        setPricesRefreshing(true);
        try {
          const live = await getInventoryPriceHintsBatched(token, retryTargets, {
            forceRefresh: true,
            chunkSize: INVENTORY_PRICE_HINTS_REFRESH_BATCH,
          });
          if (!stillCurrent()) {
            return;
          }
          applyHints(
            live.response.hints,
            live.response.steamPriceFetchedAt,
            retryTargets,
          );
          if (live.okCount === 0 && !hasAnySteamPrice(priceHintsRef.current)) {
            setPricesError(live.lastError);
          } else {
            setPricesError(null);
          }
        } catch (err: unknown) {
          if (stillCurrent() && !hasAnySteamPrice(priceHintsRef.current)) {
            setPricesError(err);
          }
        } finally {
          if (stillCurrent()) {
            setPricesRefreshing(false);
          }
        }
        return;
      }

      let reportedMissing = listableNamesMissingSteamPrice(
        inventoryAssets,
        namesMissingSteamPrice(marketHashNames, priceHintsRef.current),
      );
      try {
        const cached = await getInventoryPriceHintsBatched(token, marketHashNames, {
          cacheOnly: true,
        });
        if (!stillCurrent()) {
          return;
        }
        if (cached.okCount > 0) {
          const apiMissing = cached.response.steamPriceMissing ?? [];
          applyHints(
            cached.response.hints,
            cached.response.steamPriceFetchedAt,
            apiMissing,
          );
          reportedMissing = listableNamesMissingSteamPrice(
            inventoryAssets,
            apiMissing,
          );
        } else if (!hasAnySteamPrice(priceHintsRef.current)) {
          setPricesError(cached.lastError);
        }
      } catch (err: unknown) {
        if (stillCurrent() && !hasAnySteamPrice(priceHintsRef.current)) {
          setPricesError(err);
        }
      } finally {
        if (stillCurrent()) {
          setPricesLoading(false);
        }
      }

      if (!stillCurrent() || reportedMissing.length === 0) {
        return;
      }

      setPricesRefreshing(true);
      try {
        const live = await getInventoryPriceHintsBatched(token, reportedMissing, {
          chunkSize: INVENTORY_PRICE_HINTS_REFRESH_BATCH,
        });
        if (!stillCurrent()) {
          return;
        }
        applyHints(
          live.response.hints,
          live.response.steamPriceFetchedAt,
          reportedMissing,
        );
        if (live.okCount === 0 && !hasAnySteamPrice(priceHintsRef.current)) {
          setPricesError(live.lastError);
        } else if (hasAnySteamPrice(priceHintsRef.current) || live.okCount > 0) {
          setPricesError(null);
        }
      } catch (err: unknown) {
        if (stillCurrent() && !hasAnySteamPrice(priceHintsRef.current)) {
          setPricesError(err);
        }
      } finally {
        if (stillCurrent()) {
          setPricesRefreshing(false);
        }
      }
    },
    [token],
  );

  const scheduleStaleRevalidate = useCallback(
    (syncMeta: InventorySyncMeta | null | undefined) => {
      const generation = ++inventorySyncPollRef.current;
      if (!token || !syncMeta) {
        setBackgroundSyncing(false);
        setSyncPollTimedOut(false);
        return;
      }

      const firstDecision = decideInventorySyncPoll({
        stale: syncMeta.stale,
        backgroundPending: syncMeta.backgroundPending,
        errorCode: syncMeta.errorCode,
        elapsedMs: 0,
      });
      if (firstDecision === 'fresh') {
        setBackgroundSyncing(false);
        setSyncPollTimedOut(false);
        return;
      }
      if (firstDecision === 'failed') {
        setBackgroundSyncing(false);
        setSyncPollTimedOut(false);
        return;
      }

      setSyncPollTimedOut(false);
      setBackgroundSyncing(true);
      const startedAt = Date.now();
      let attempt = 0;

      const tick = () => {
        window.setTimeout(() => {
          if (generation !== inventorySyncPollRef.current || !token) {
            return;
          }
          void getInventory(token)
            .then((response) => {
              if (generation !== inventorySyncPollRef.current) {
                return;
              }
              setAssets(response.assets);
              setSync(response.sync);
              if (user?.id) {
                writeInventorySession({
                  ownerKey: user.id,
                  assets: response.assets,
                  sync: response.sync,
                  savedAt: Date.now(),
                });
              }
              if (!response.sync.stale) {
                void loadPriceHints(response.assets);
              }
              const decision = decideInventorySyncPoll({
                stale: response.sync.stale,
                backgroundPending: response.sync.backgroundPending,
                errorCode: response.sync.errorCode,
                elapsedMs: Date.now() - startedAt,
              });
              if (decision === 'fresh') {
                setBackgroundSyncing(false);
                setSyncPollTimedOut(false);
                return;
              }
              if (decision === 'failed' || decision === 'timeout') {
                setBackgroundSyncing(false);
                setSyncPollTimedOut(decision === 'timeout');
                return;
              }
              attempt += 1;
              tick();
            })
            .catch(() => {
              if (generation !== inventorySyncPollRef.current) {
                return;
              }
              setBackgroundSyncing(false);
              setSyncPollTimedOut(true);
            });
        }, nextInventorySyncPollDelayMs(attempt));
      };

      tick();
    },
    [token, loadPriceHints, user?.id],
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
      } else if (assets.length === 0) {
        setLoading(true);
      }
      inventorySyncPollRef.current += 1;
      setSyncPollTimedOut(false);
      setError(null);
      try {
        const response = await getInventory(token, { forceRefresh });
        setAssets(response.assets);
        setSync(response.sync);
        if (user?.id) {
          writeInventorySession({
            ownerKey: user.id,
            assets: response.assets,
            sync: response.sync,
            savedAt: Date.now(),
          });
        }
        void loadPriceHints(response.assets);
        scheduleStaleRevalidate(response.sync);
      } catch (err: unknown) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, steamLinked, assets.length, loadPriceHints, scheduleStaleRevalidate, user?.id],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    const cached = user?.id ? readInventorySession(user.id) : null;
    if (cached?.assets.length) {
      setAssets(cached.assets);
      setSync(cached.sync);
      setLoading(false);
    }

    let cancelled = false;
    if (!cached?.assets.length) {
      setLoading(true);
    }

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
        writeInventorySession({
          ownerKey: profile.id,
          assets: response.assets,
          sync: response.sync,
          savedAt: Date.now(),
        });
        void loadPriceHints(response.assets);
        scheduleStaleRevalidate(response.sync);
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
      inventorySyncPollRef.current += 1;
    };
  }, [token, updateUser, loadPriceHints, scheduleStaleRevalidate, user?.id]);

  useEffect(() => {
    if (!priceMinor) {
      setPreview(null);
      if (priceInput.trim() !== '') {
        setPriceError(t('lots.invalidPrice'));
      } else {
        setPriceError(null);
      }
      return;
    }
    setPriceError(null);
    getPricingPreview(priceMinor)
      .then(setPreview)
      .catch((err: unknown) => setSellError(err));
  }, [priceMinor, priceInput, t]);

  useEffect(() => {
    if (!selectedAssetId) {
      return;
    }
    const stillExists = assets.some((asset) => asset.id === selectedAssetId);
    if (!stillExists) {
      setSelectedAssetId(null);
    }
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void getMyLots(token)
      .then((lots) => {
        if (cancelled || lots.length === 0) {
          return;
        }
        setHasListedBefore(true);
        markSellerOnboardingComplete();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  const showStaleBadge = Boolean(sync?.stale);
  const showSellerOnboarding = !hasListedBefore && !onboardingDismissed;
  const inventoryEmptyKind = resolveInventoryEmptyKind(sync, {
    syncPollTimedOut,
    backgroundSyncing,
  });
  const inventoryEmptyMessages = inventoryEmptyKindMessageKeys(inventoryEmptyKind);

  const resetInventoryFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setShowUnavailable(false);
  }, []);

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

  const hiddenCount = useMemo(() => {
    if (showUnavailable) {
      return 0;
    }
    return assets.filter((asset) => !isInventoryAssetVisible(asset, false)).length;
  }, [assets, showUnavailable]);

  function selectAsset(asset: InventoryAsset) {
    if (!canOpenInventorySellPanel(asset)) {
      return;
    }
    setSelectedAssetId(asset.id);
    setBulkListCount(1);
    setSellError(null);
    setPriceError(null);
    setPriceDirty(false);

    if (canEditListedAsset(asset)) {
      const listedMinor = asset.listedPriceMinor
        ? Number(asset.listedPriceMinor)
        : NaN;
      if (Number.isFinite(listedMinor) && listedMinor > 0) {
        setPriceInput(minorToPriceInput(listedMinor));
      } else {
        setPriceInput('');
      }
      return;
    }

    const recommendedMinor = getRecommendedPriceMinor(
      priceHints[asset.itemDefinition.marketHashName],
    );
    setPriceInput(recommendedMinor ? minorToPriceInput(recommendedMinor) : '');
  }

  const clearSelection = useCallback(() => {
    setSelectedAssetId(null);
    setBulkListCount(1);
    setSellError(null);
    setCanceling(false);
    setPriceDirty(false);
    setPriceError(null);
    setPriceInput('');
  }, []);

  useEffect(() => {
    if (!sellPanelOpen || sellPanelMode !== 'create') {
      return;
    }
    const recommendedMinor = getRecommendedPriceMinor(selectedPriceHint);
    if (
      !shouldAutofillListingPrice({
        mode: sellPanelMode,
        priceDirty,
        currentInput: priceInput,
        recommendedMinor,
      })
    ) {
      return;
    }
    setPriceInput(minorToPriceInput(recommendedMinor!));
  }, [sellPanelOpen, sellPanelMode, priceDirty, priceInput, selectedPriceHint]);

  async function handleSubmitListing(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedAsset || !priceMinor) {
      setPriceError(t('lots.invalidPrice'));
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
        const updated = await updateLotPrice(token, lotId, priceMinor);
        setAssets((previous) =>
          previous.map((asset) =>
            asset.id === selectedAsset.id
              ? {
                  ...asset,
                  listedPriceMinor: updated.priceMinor,
                }
              : asset,
          ),
        );
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
      markSellerOnboardingComplete();
      setHasListedBefore(true);
      navigate('/deals?tab=listings&listed=1');
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
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={
          <button
            type="button"
            className="button secondary"
            disabled={loading || refreshing || !steamLinked}
            data-testid="inventory-refresh"
            onClick={() => void loadInventory(true)}
          >
            {refreshing ? t('inventory.refreshing') : t('inventory.refresh')}
          </button>
        }
      />

      {token ? (
        <ExtensionAwareCommerceHint surface="sell" token={token} />
      ) : null}

      {showSellerOnboarding ? (
        <InventorySellerOnboarding
          steamLinked={steamLinked}
          tradeUrlReady={tradeUrlReady}
          itemSelected={Boolean(selectedAssetId)}
          sellPanelOpen={sellPanelOpen}
          onDismiss={() => setOnboardingDismissed(true)}
        />
      ) : (
        <SellerSaleInfo compact={hasListedBefore} />
      )}

      {!steamLinked && requiresSteamLink ? (
        <p className="muted small" data-testid="inventory-refresh-hint">
          {t('inventory.steamRequiredMessage')}
        </p>
      ) : null}

      {showDevReset && token ? (
        <div className="dev-panel" data-testid="inventory-dev-reset-panel">
          <p className="muted small">{t('inventory.devResetHint')}</p>
          <button
            type="button"
            className="button secondary"
            disabled={resettingDevTrades || loading || refreshing}
            data-testid="inventory-reset-dev-trades"
            onClick={() => void handleResetDevTrades()}
          >
            {resettingDevTrades
              ? t('inventory.resettingDevTrades')
              : t('inventory.resetDevTrades')}
          </button>
        </div>
      ) : null}

      {sync ? (
        <p className="muted small">
          {t('inventory.lastSync', {
            when: new Date(sync.lastSyncedAt).toLocaleString(),
          })}
          {formatDataTimestamp(steamPriceFetchedAt) ? (
            <span>
              {' '}
              ·{' '}
              {t('inventory.steamPricesAt', {
                when: formatDataTimestamp(steamPriceFetchedAt) ?? '',
              })}
            </span>
          ) : null}
          {showStaleBadge ? (
            <span className="badge badge-stale" style={{ marginLeft: '0.5rem' }}>
              {t('inventory.stale')}
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

      {!showSellerOnboarding && !steamLinked && requiresSteamLink ? (
        <div className="card inventory-readiness-banner" data-testid="steam-link-required">
          <p>{t('inventory.steamRequiredBanner')}</p>
          <Link className="button primary" to="/account">
            {t('inventory.linkSteamFirst')}
          </Link>
        </div>
      ) : null}

      {!showSellerOnboarding && steamLinked && !tradeUrlReady ? (
        <div className="card inventory-readiness-banner" data-testid="inventory-trade-url-warning">
          <p>
            {t('inventory.tradeUrlRequiredPrefix')}{' '}
            <Link to="/account">{t('inventory.tradeUrlRequiredLink')}</Link>{' '}
            {t('inventory.tradeUrlRequiredSuffix')}
          </p>
          <Link className="button primary" to="/account">
            {t('inventory.linkSteamFirst')}
          </Link>
        </div>
      ) : null}

      {loading && steamLinked && tradeUrlReady ? (
        <div className="inventory-workspace">
          <div className="inventory-main">
            <p className="muted small" data-testid="inventory-loading-hint">
              {t('inventory.loadingHint')}
            </p>
            <InventoryGridSkeleton />
          </div>
        </div>
      ) : null}

      {steamLinked &&
      tradeUrlReady &&
      !loading &&
      !error &&
      assets.length === 0 &&
      !backgroundSyncing ? (
        <EmptyState
          title={t(inventoryEmptyMessages.titleKey)}
          message={t(inventoryEmptyMessages.messageKey)}
          steps={
            inventoryEmptyKind === 'tradableEmpty'
              ? [
                  t('inventory.emptyTradableStep1'),
                  t('inventory.emptyTradableStep2'),
                  t('inventory.emptyTradableStep3'),
                ]
              : undefined
          }
          action={
            <button
              type="button"
              className="button primary"
              disabled={refreshing}
              data-testid="inventory-empty-refresh"
              onClick={() => void loadInventory(true)}
            >
              {refreshing ? t('inventory.refreshing') : t('inventory.refresh')}
            </button>
          }
          secondaryAction={
            inventoryEmptyKind === 'private' ? (
              <a
                href="https://steamcommunity.com/my/edit/settings"
                className="button secondary"
                target="_blank"
                rel="noreferrer noopener"
                data-testid="inventory-empty-steam-settings"
              >
                {t('inventory.emptyPrivateSteamAction')}
              </a>
            ) : inventoryEmptyKind === 'syncFailed' ? (
              <Link to="/support" className="button secondary" data-testid="inventory-empty-support">
                {t('support.title')}
              </Link>
            ) : (
              <Link to="/catalog" className="button secondary" data-testid="inventory-empty-catalog">
                {t('orders.toCatalog')}
              </Link>
            )
          }
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
                {t('inventory.backgroundSyncing')}
              </p>
            ) : null}

            {!backgroundSyncing && syncPollTimedOut ? (
              <div
                className="inventory-price-banner"
                data-testid="inventory-sync-timeout"
              >
                <p className="muted small">{t('inventory.syncTimedOut')}</p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-sync-retry"
                  onClick={() => void loadInventory(true)}
                >
                  {t('inventory.retry')}
                </button>
              </div>
            ) : null}

            {pricesLoading || pricesRefreshing ? (
              <p className="muted small inventory-price-inline" data-testid="inventory-prices-loading">
                {pricesLoading ? t('inventory.pricesLoading') : t('inventory.pricesRefreshing')}
              </p>
            ) : null}

            {!pricesLoading && !pricesRefreshing && pricesError ? (
              <div
                className="inventory-price-banner inventory-price-banner-error"
                data-testid="inventory-prices-error"
              >
                <p className="muted small">{t('inventory.pricesError')}</p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-prices-retry"
                  onClick={() => void loadPriceHints(assets, true)}
                >
                  {t('inventory.retry')}
                </button>
              </div>
            ) : null}

            {!pricesLoading && !pricesRefreshing && !pricesError && steamPriceMissing.length > 0 ? (
              <div
                className="inventory-price-banner"
                data-testid="inventory-prices-partial"
              >
                <p className="muted small">
                  {t(
                    steamPriceMissing.length === 1
                      ? 'inventory.missingPricesCount_one'
                      : 'inventory.missingPricesCount_many',
                    { count: steamPriceMissing.length },
                  )}
                </p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-prices-retry-partial"
                  onClick={() => void loadPriceHints(assets, true)}
                >
                  {t('inventory.retry')}
                </button>
              </div>
            ) : null}

            <div className="inventory-toolbar" data-testid="inventory-filters">
              <div className="inventory-toolbar-fields">
                <label className="field catalog-filter-field inventory-toolbar-search">
                  <span className="field-label">{t('common.search')}</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('inventory.searchPlaceholder')}
                    data-testid="inventory-search"
                  />
                </label>
                <label className="field catalog-filter-field">
                  <span className="field-label">{t('inventory.status')}</span>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as InventoryStatusFilter)
                    }
                    data-testid="inventory-status-filter"
                  >
                    {INVENTORY_STATUS_FILTER_IDS.map((id) => (
                      <option key={id} value={id}>
                        {t(`inventoryFilter.${id}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field catalog-filter-field">
                  <span className="field-label">{t('inventory.sort')}</span>
                  <select
                    value={sortOption}
                    onChange={(event) =>
                      setSortOption(event.target.value as InventorySortOption)
                    }
                    data-testid="inventory-sort"
                  >
                    {INVENTORY_SORT_OPTION_IDS.map((id) => (
                      <option key={id} value={id}>
                        {t(inventorySortOptionLabelKey(id))}
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
                  <span className="muted small">{t('inventory.showUnavailable')}</span>
                </label>
              </div>
              <p className="muted small inventory-filter-total" data-testid="inventory-filter-total">
                {formatInventoryFilterTotal({
                  itemCount: filteredAssets.length,
                  stackCount: displayStacks.length,
                  hiddenCount,
                  visibleTotal: visibleCount,
                  locale,
                  t,
                })}
              </p>
            </div>

            {displayStacks.length === 0 ? (
              <EmptyState
                title={t('common.nothingFound')}
                message={t('common.changeFilters')}
                action={
                  <button
                    type="button"
                    className="button secondary"
                    data-testid="inventory-reset-filters"
                    onClick={resetInventoryFilters}
                  >
                    {t('common.resetFilters')}
                  </button>
                }
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
            aria-label={t('inventory.closeSellPanel')}
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
                steamPricesLoading={steamPricesLoading}
                steamPriceFetchedAt={steamPriceFetchedAt}
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
                onPriceChange={(value) => {
                  setPriceDirty(true);
                  setPriceInput(value);
                }}
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
