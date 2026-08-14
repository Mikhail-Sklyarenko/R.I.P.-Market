import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listCatalogItems, listPopularCatalogItems, getCatalogSteamPrices } from '../api/marketplace';
import type { CatalogItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CatalogCategoryBar } from '../components/CatalogCategoryBar';
import { CatalogFloatRangeFilter } from '../components/CatalogFloatRangeFilter';
import { CatalogItemCard } from '../components/CatalogItemCard';
import { CatalogPriceRangeFilter } from '../components/CatalogPriceRangeFilter';
import { CatalogRarityFilter } from '../components/CatalogRarityFilter';
import { CatalogSkinTraitsFilter } from '../components/CatalogSkinTraitsFilter';
import { CatalogWearFilter } from '../components/CatalogWearFilter';
import { ErrorAlert } from '../components/ErrorAlert';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { TrustBanner } from '../components/TrustBanner';
import { useLocale } from '../i18n';
import {
  CATALOG_PAGE_LIMIT,
  CATALOG_PAGE_SIZE_OPTIONS,
  findCategoryOption,
  findTabForWeapon,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
} from '../utils/catalog-filters';
import {
  EMPTY_SKIN_TRAIT_FILTERS,
  skinTraitFiltersToQuery,
  type SkinTraitCheckboxState,
} from '../utils/catalog-skin-trait-filters';
import { parseUsdToMinor } from '../utils/format';
import { formatDataTimestamp } from '../utils/lot-display';
import { resolveCatalogCardDisplaySteamPriceName } from '../utils/steam-market-link';
import {
  consumeCatalogScrollRestore,
  parseCatalogLimitParam,
  parseCatalogPageParam,
} from '../utils/catalog-return-state';
import {
  dedupeCatalogItems,
  mergeCatalogItems,
} from '../utils/catalog-load-more';

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'popular';

function toCatalogSort(
  sort: SortOption,
): 'newest' | 'cheapest' | 'price_desc' | 'popular' {
  if (sort === 'price-asc') {
    return 'cheapest';
  }
  if (sort === 'price-desc') {
    return 'price_desc';
  }
  if (sort === 'popular') {
    return 'popular';
  }
  return 'newest';
}

function getInitialCategoryValue(weaponParam: string | null): string {
  if (!weaponParam) {
    return '';
  }
  const option = findCategoryOption(weaponParam);
  return option?.value ?? weaponParam;
}

/** Keep chunks small so the first prices appear before Steam finishes the whole page. */
const STEAM_PRICE_CHUNK_SIZE = 4;
const STEAM_PRICE_STALE_MS = 20 * 60 * 1000;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isSteamPriceFresh(item: CatalogItem): boolean {
  if (item.steamPriceMinor == null || !item.steamPriceFetchedAt) {
    return false;
  }
  return Date.now() - new Date(item.steamPriceFetchedAt).getTime() <= STEAM_PRICE_STALE_MS;
}

function applyCatalogPriceState(
  catalogItems: CatalogItem[],
  setters: {
    setSteamPrices: Dispatch<SetStateAction<Record<string, number | null>>>;
    setPendingPriceNames: Dispatch<SetStateAction<Set<string>>>;
    setSteamPriceFetchedAt: Dispatch<SetStateAction<string | null>>;
  },
  responseSteamPriceFetchedAt?: string | null,
) {
  const seeded = buildPriceStateFromItems(catalogItems);
  setters.setSteamPrices((prev) => ({ ...prev, ...seeded.steamPrices }));
  setters.setPendingPriceNames((prev) => {
    const next = new Set(prev);
    for (const name of seeded.pending) {
      next.add(name);
    }
    return next;
  });
  if (responseSteamPriceFetchedAt) {
    setters.setSteamPriceFetchedAt(responseSteamPriceFetchedAt);
  }
}

function buildPriceStateFromItems(items: CatalogItem[]) {
  const steamPrices: Record<string, number | null> = {};
  const pending = new Set<string>();

  for (const item of items) {
    if (item.steamPriceMinor != null) {
      steamPrices[item.marketHashName] = item.steamPriceMinor;
      continue;
    }
    pending.add(item.marketHashName);
  }

  return { steamPrices, pending };
}

function mergeSteamPricesForItems(
  response: Awaited<ReturnType<typeof getCatalogSteamPrices>>,
  catalogItems: CatalogItem[],
): Record<string, number | null> {
  const next: Record<string, number | null> = {};
  for (const item of catalogItems) {
    const lookupName = resolveCatalogCardDisplaySteamPriceName(
      item.marketHashName,
      item.availableWears,
    );
    next[item.marketHashName] = response.prices[lookupName]?.priceMinor ?? null;
  }
  return next;
}

export function CatalogPage() {
  const { token } = useAuth();
  const { t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const weaponParam = searchParams.get('weapon');

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [popularItems, setPopularItems] = useState<CatalogItem[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(null);
  const [steamPrices, setSteamPrices] = useState<Record<string, number | null>>({});
  const [pendingPriceNames, setPendingPriceNames] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [wearFilter, setWearFilter] = useState('');
  const [skinTraitFilters, setSkinTraitFilters] =
    useState<SkinTraitCheckboxState>(EMPTY_SKIN_TRAIT_FILTERS);
  const [floatMin, setFloatMin] = useState('');
  const [floatMax, setFloatMax] = useState('');
  const loadedPage = parseCatalogPageParam(searchParams.get('page'));
  const pageLimit = parseCatalogLimitParam(searchParams.get('limit'), CATALOG_PAGE_LIMIT);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const previousBaseQueryKeyRef = useRef<string | null>(null);
  const previousLoadedPageRef = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState(
    weaponParam ? findTabForWeapon(weaponParam) : 'all',
  );
  const [categoryValue, setCategoryValue] = useState(getInitialCategoryValue(weaponParam));

  const categoryFilter = useMemo(
    () => resolveCatalogFilter(activeTabId, categoryValue),
    [activeTabId, categoryValue],
  );

  const baseQuery = useMemo(() => {
    const minMinor = minPrice ? parseUsdToMinor(minPrice) : undefined;
    const maxMinor = maxPrice ? parseUsdToMinor(maxPrice) : undefined;
    const parsedFloatMin = floatMin.trim() ? Number(floatMin) : undefined;
    const parsedFloatMax = floatMax.trim() ? Number(floatMax) : undefined;

    return {
      q: search.trim() || categoryFilter.q || undefined,
      minPriceMinor: minMinor ?? undefined,
      maxPriceMinor: maxMinor ?? undefined,
      weapon: categoryFilter.weapon,
      rarity: rarityFilter || categoryFilter.rarity,
      wear: wearFilter || undefined,
      ...skinTraitFiltersToQuery(skinTraitFilters),
      floatMin:
        parsedFloatMin !== undefined && Number.isFinite(parsedFloatMin)
          ? parsedFloatMin
          : undefined,
      floatMax:
        parsedFloatMax !== undefined && Number.isFinite(parsedFloatMax)
          ? parsedFloatMax
          : undefined,
      sort: toCatalogSort(sort),
      limit: pageLimit,
    };
  }, [
    search,
    sort,
    minPrice,
    maxPrice,
    rarityFilter,
    wearFilter,
    skinTraitFilters,
    floatMin,
    floatMax,
    pageLimit,
    categoryFilter,
  ]);

  const baseQueryKey = useMemo(() => JSON.stringify(baseQuery), [baseQuery]);

  const showResetFilters =
    hasActiveCatalogFilters({
      search,
      sort,
      minPrice,
      maxPrice,
      activeTabId,
      categoryValue,
      wearFilter,
      floatMin,
      floatMax,
      skinTraitFilters,
    }) || Boolean(rarityFilter);

  const filtersActive = showResetFilters;
  const isInitialLoading = loading && items.length === 0;
  const isRefreshing = loading && items.length > 0;
  const showPopularSection =
    (!filtersActive || loading) && !popularLoading && popularItems.length > 0;

  const catalogFilterKey = useMemo(
    () =>
      JSON.stringify({
        search,
        sort,
        minPrice,
        maxPrice,
        rarityFilter,
        wearFilter,
        skinTraitFilters,
        floatMin,
        floatMax,
        activeTabId,
        categoryValue,
      }),
    [
      search,
      sort,
      minPrice,
      maxPrice,
      rarityFilter,
      wearFilter,
      skinTraitFilters,
      floatMin,
      floatMax,
      activeTabId,
      categoryValue,
    ],
  );
  const previousCatalogFilterKeyRef = useRef(catalogFilterKey);

  function setPageLimit(nextLimit: number) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextLimit === CATALOG_PAGE_LIMIT) {
      nextParams.delete('limit');
    } else {
      nextParams.set('limit', String(nextLimit));
    }
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function goToPage(nextPage: number, options?: { scrollToTop?: boolean }) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      nextParams.delete('page');
    } else {
      nextParams.set('page', String(nextPage));
    }
    setSearchParams(nextParams, { replace: true });
    if (options?.scrollToTop ?? false) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function loadMoreCatalogItems() {
    if (loadingMore || loading || items.length >= total) {
      return;
    }
    goToPage(loadedPage + 1);
  }

  useEffect(() => {
    let cancelled = false;
    const baseQueryChanged = previousBaseQueryKeyRef.current !== baseQueryKey;
    const priceSetters = {
      setSteamPrices,
      setPendingPriceNames,
      setSteamPriceFetchedAt,
    };

    async function fetchCatalogPages(fromPage: number, toPage: number, mode: 'replace' | 'append') {
      if (mode === 'append') {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        if (toPage <= 1) {
          const response = await listCatalogItems({ ...baseQuery, page: 1 });
          if (cancelled) {
            return;
          }
          setItems(response.items);
          setTotal(response.total);
          applyCatalogPriceState(response.items, priceSetters, response.steamPriceFetchedAt);
          return;
        }

        if (mode === 'append' && toPage > fromPage) {
          const response = await listCatalogItems({ ...baseQuery, page: toPage });
          if (cancelled) {
            return;
          }
          setItems((current) => mergeCatalogItems(current, response.items));
          setTotal(response.total);
          applyCatalogPriceState(response.items, priceSetters, response.steamPriceFetchedAt);
          return;
        }

        const mergedItems: CatalogItem[] = [];
        let totalCount = 0;
        let latestSteamPriceFetchedAt: string | null | undefined;
        for (let pageNumber = 1; pageNumber <= toPage; pageNumber += 1) {
          const response = await listCatalogItems({ ...baseQuery, page: pageNumber });
          if (cancelled) {
            return;
          }
          mergedItems.push(...response.items);
          totalCount = response.total;
          latestSteamPriceFetchedAt = response.steamPriceFetchedAt ?? latestSteamPriceFetchedAt;
        }
        const deduped = dedupeCatalogItems(mergedItems);
        setItems(deduped);
        setTotal(totalCount);
        applyCatalogPriceState(deduped, priceSetters, latestSteamPriceFetchedAt);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    }

    if (baseQueryChanged) {
      const isInitialMount = previousLoadedPageRef.current === 0;
      const pagesToLoad = isInitialMount && loadedPage > 1 ? loadedPage : 1;
      previousBaseQueryKeyRef.current = baseQueryKey;
      previousLoadedPageRef.current = pagesToLoad;
      void fetchCatalogPages(1, pagesToLoad, 'replace');
      return () => {
        cancelled = true;
        // Strict Mode remounts after cancel — allow the next effect run to fetch again.
        previousBaseQueryKeyRef.current = null;
        previousLoadedPageRef.current = 0;
      };
    }

    if (loadedPage > previousLoadedPageRef.current) {
      const fromPage = previousLoadedPageRef.current;
      previousLoadedPageRef.current = loadedPage;
      void fetchCatalogPages(fromPage, loadedPage, 'append');
      return () => {
        cancelled = true;
        previousLoadedPageRef.current = fromPage;
      };
    }

    if (loadedPage < previousLoadedPageRef.current) {
      previousLoadedPageRef.current = loadedPage;
      void fetchCatalogPages(1, Math.max(loadedPage, 1), 'replace');
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [baseQuery, baseQueryKey, loadedPage]);

  useEffect(() => {
    if (filtersActive) {
      if (!loading) {
        setPopularItems([]);
      }
      setPopularLoading(false);
      return;
    }

    let cancelled = false;
    setPopularLoading(true);
    listPopularCatalogItems(12)
      .then((popular) => {
        if (!cancelled) {
          setPopularItems(popular);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPopularItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPopularLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filtersActive, loading]);

  useEffect(() => {
    const allItems = [...items, ...popularItems];
    const marketHashNames = [
      ...new Set(allItems.map((item) => item.marketHashName).filter(Boolean)),
    ];
    if (marketHashNames.length === 0) {
      setPendingPriceNames(new Set());
      return;
    }

    const seeded: Record<string, number | null> = {};
    const missing: string[] = [];
    const softRefresh: string[] = [];

    for (const name of marketHashNames) {
      const item = allItems.find((entry) => entry.marketHashName === name);
      const resolvedPrice = item?.steamPriceMinor ?? steamPrices[name] ?? null;
      if (resolvedPrice != null) {
        seeded[name] = resolvedPrice;
        if (!item || !isSteamPriceFresh(item)) {
          softRefresh.push(name);
        }
      } else {
        missing.push(name);
      }
    }

    // Skins first — medals/coins often have no Steam market price and burn rate limit.
    missing.sort((left, right) => {
      const leftSkin = left.includes(' | ') ? 0 : 1;
      const rightSkin = right.includes(' | ') ? 0 : 1;
      return leftSkin - rightSkin;
    });

    setSteamPrices((prev) => ({ ...prev, ...seeded }));
    setPendingPriceNames(new Set(missing));

    if (missing.length === 0 && softRefresh.length === 0) {
      return;
    }

    let cancelled = false;
    const loadedPrices: Record<string, number | null> = { ...seeded };
    const batches = chunkArray(missing, STEAM_PRICE_CHUNK_SIZE);

    async function refreshChunk(chunk: string[]) {
      const catalogItems = chunk
        .map((name) => allItems.find((entry) => entry.marketHashName === name))
        .filter((entry): entry is CatalogItem => Boolean(entry));
      const lookupNames = catalogItems.map((item) =>
        resolveCatalogCardDisplaySteamPriceName(
          item.marketHashName,
          item.availableWears,
        ),
      );
      const response = await getCatalogSteamPrices(lookupNames);
      if (cancelled) {
        return {};
      }

      const chunkPrices = mergeSteamPricesForItems(response, catalogItems);
      Object.assign(loadedPrices, chunkPrices);
      setSteamPrices((prev) => ({ ...prev, ...chunkPrices }));
      if (response.steamPriceFetchedAt) {
        setSteamPriceFetchedAt(response.steamPriceFetchedAt);
      }
      return chunkPrices;
    }

    async function refreshSteamPrices() {
      for (const chunk of batches) {
        if (cancelled) {
          return;
        }

        try {
          await refreshChunk(chunk);
        } catch {
          // Try the next batch even if one request fails.
        }

        if (!cancelled) {
          setPendingPriceNames((prev) => {
            const next = new Set(prev);
            for (const name of chunk) {
              next.delete(name);
            }
            return next;
          });
        }
      }

      if (cancelled) {
        return;
      }

      const retryNames = missing.filter((name) => loadedPrices[name] == null);
      if (retryNames.length > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1_500);
        });
        if (cancelled) {
          return;
        }

        for (const chunk of chunkArray(retryNames, STEAM_PRICE_CHUNK_SIZE)) {
          if (cancelled) {
            return;
          }
          setPendingPriceNames((prev) => {
            const next = new Set(prev);
            for (const name of chunk) {
              next.add(name);
            }
            return next;
          });
          try {
            await refreshChunk(chunk);
          } catch {
            // Continue remaining retries.
          }
          if (!cancelled) {
            setPendingPriceNames((prev) => {
              const next = new Set(prev);
              for (const name of chunk) {
                next.delete(name);
              }
              return next;
            });
          }
        }
      }

      if (!cancelled && softRefresh.length > 0) {
        for (const chunk of chunkArray(softRefresh, STEAM_PRICE_CHUNK_SIZE)) {
          if (cancelled) {
            return;
          }
          try {
            await refreshChunk(chunk);
          } catch {
            // Soft refresh failures are non-blocking.
          }
        }
      }

      if (!cancelled) {
        setPendingPriceNames(new Set());
      }
    }

    void refreshSteamPrices();

    return () => {
      cancelled = true;
    };
    // Intentionally omit steamPrices: seeding uses a snapshot of state when items change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, popularItems]);

  useEffect(() => {
    if (previousCatalogFilterKeyRef.current === catalogFilterKey) {
      return;
    }
    previousCatalogFilterKeyRef.current = catalogFilterKey;

    if (!searchParams.get('page')) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  }, [catalogFilterKey, searchParams, setSearchParams]);

  useEffect(() => {
    if (!weaponParam) {
      return;
    }
    const nextCategoryValue = getInitialCategoryValue(weaponParam);
    setCategoryValue(nextCategoryValue);
    setActiveTabId(findTabForWeapon(weaponParam));
  }, [weaponParam]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const scrollY = consumeCatalogScrollRestore();
    if (scrollY != null) {
      pendingScrollRestoreRef.current = scrollY;
    }
  }, [loading, searchParams]);

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current == null || loading || loadingMore) {
      return;
    }

    window.scrollTo({ top: pendingScrollRestoreRef.current, behavior: 'instant' });
    pendingScrollRestoreRef.current = null;
  }, [loading, loadingMore, items, searchParams]);

  const hasMoreItems = items.length < total;

  function handleCategoryChange(value: string) {
    setCategoryValue(value);
    const option = findCategoryOption(value);
    if (option && option.tabId !== 'all') {
      setActiveTabId(option.tabId);
    } else if (!value) {
      setActiveTabId('all');
    }

    const nextParams = new URLSearchParams(searchParams);
    const paramValue = option?.weapon ?? (option?.value && option.tabId !== 'all' ? option.value : undefined);
    if (paramValue) {
      nextParams.set('weapon', paramValue);
    } else {
      nextParams.delete('weapon');
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handleTabChange(tabId: string) {
    setActiveTabId(tabId);
    setCategoryValue('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('weapon');
    setSearchParams(nextParams, { replace: true });
  }

  function handleResetFilters() {
    setSearch('');
    setSort('newest');
    setMinPrice('');
    setMaxPrice('');
    setRarityFilter('');
    setWearFilter('');
    setSkinTraitFilters(EMPTY_SKIN_TRAIT_FILTERS);
    setFloatMin('');
    setFloatMax('');
    setActiveTabId('all');
    setCategoryValue('');
    setSearchParams({}, { replace: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('catalog.title')}
        subtitle={t('catalog.subtitle')}
      />

      <TrustBanner />

      <div className="catalog-search-toolbar" data-testid="catalog-search-toolbar">
        <label className="field catalog-filter-field catalog-search-field">
          <span className="sr-only">{t('catalog.search')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('catalog.searchPlaceholder')}
            aria-label={t('catalog.search')}
            data-testid="catalog-search"
          />
        </label>
        <label className="field catalog-filter-field catalog-sort-field">
          <span className="sr-only">{t('catalog.sort')}</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            aria-label={t('catalog.sort')}
            data-testid="catalog-sort"
          >
            <option value="popular">{t('catalog.sortPopular')}</option>
            <option value="newest">{t('catalog.sortNewest')}</option>
            <option value="price-asc">{t('catalog.sortPriceAsc')}</option>
            <option value="price-desc">{t('catalog.sortPriceDesc')}</option>
          </select>
        </label>
        <label className="field catalog-filter-field catalog-page-size-field">
          <span className="sr-only">{t('catalog.pageSize')}</span>
          <select
            value={pageLimit}
            onChange={(event) => setPageLimit(Number(event.target.value))}
            aria-label={t('catalog.pageSize')}
            data-testid="catalog-page-size"
          >
            {CATALOG_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {t('catalog.pageSizeOption', { count: size })}
              </option>
            ))}
          </select>
        </label>
        {showResetFilters ? (
          <button
            type="button"
            className="button secondary sm catalog-reset-filters-btn"
            data-testid="catalog-reset-filters"
            onClick={handleResetFilters}
          >
            {t('catalog.resetFilters')}
          </button>
        ) : null}
      </div>

      <div className="catalog-category-strip card" data-testid="catalog-category-strip">
        <CatalogCategoryBar
          activeTabId={activeTabId}
          categoryValue={categoryValue}
          onTabChange={handleTabChange}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      <div className="catalog-layout">
        <aside
          className={`catalog-sidebar card${sidebarOpen ? ' is-open' : ''}`}
          data-testid="catalog-sidebar"
        >
          <button
            type="button"
            className="catalog-sidebar-toggle"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {t('catalog.filters')}
          </button>

          <div className="catalog-sidebar-body">
            <CatalogPriceRangeFilter
              minPrice={minPrice}
              maxPrice={maxPrice}
              onMinPriceChange={setMinPrice}
              onMaxPriceChange={setMaxPrice}
            />

            <CatalogRarityFilter value={rarityFilter} onChange={setRarityFilter} />

            <CatalogFloatRangeFilter
              floatMin={floatMin}
              floatMax={floatMax}
              onFloatMinChange={setFloatMin}
              onFloatMaxChange={setFloatMax}
            />

            <CatalogWearFilter value={wearFilter} onChange={setWearFilter} />

            <CatalogSkinTraitsFilter
              value={skinTraitFilters}
              onChange={setSkinTraitFilters}
            />
          </div>
        </aside>

        <div className={`catalog-main${isRefreshing ? ' is-refreshing' : ''}`}>
          <ErrorAlert error={error} />

          {isRefreshing ? (
            <div className="catalog-refresh-indicator" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              <span>{t('catalog.refreshing')}</span>
            </div>
          ) : null}

          {isInitialLoading ? <LoadingState message={t('catalog.loading')} /> : null}

          {!isInitialLoading ? (
            <>
              <p className="catalog-total" data-testid="catalog-total">
                {t('catalog.found', { count: total })}
              </p>
              {formatDataTimestamp(steamPriceFetchedAt) ? (
                <p className="muted small" data-testid="catalog-steam-price-updated-at">
                  {t('catalog.steamPricesUpdated', {
                    when: formatDataTimestamp(steamPriceFetchedAt) ?? '',
                  })}
                </p>
              ) : null}
            </>
          ) : null}

          {!isInitialLoading && popularLoading ? (
            <p className="muted small" data-testid="catalog-popular-loading">
              {t('catalog.popularLoading')}
            </p>
          ) : null}

          {!isInitialLoading && showPopularSection ? (
            <section className="catalog-popular-section" data-testid="catalog-popular-section">
              <h2 className="catalog-section-title">{t('catalog.popularTitle')}</h2>
              <div className="catalog-grid catalog-grid-compact">
                {popularItems.map((item) => (
                  <CatalogItemCard
                    key={`popular-${item.id}`}
                    item={item}
                    isLoggedIn={Boolean(token)}
                    steamPriceMinor={steamPrices[item.marketHashName]}
                    pricesLoading={pendingPriceNames.has(item.marketHashName)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {!isInitialLoading && !loading && items.length === 0 ? (
            <EmptyState
              title={t('catalog.emptyTitle')}
              message={t('catalog.emptyMessage')}
            />
          ) : null}

          {!isInitialLoading && items.length > 0 ? (
            <div className="catalog-grid" data-testid="catalog-grid">
              {items.map((item) => (
                <CatalogItemCard
                  key={item.id}
                  item={item}
                  isLoggedIn={Boolean(token)}
                  steamPriceMinor={steamPrices[item.marketHashName]}
                  pricesLoading={pendingPriceNames.has(item.marketHashName)}
                />
              ))}
            </div>
          ) : null}

          {!isInitialLoading && !loading && items.length > 0 && hasMoreItems ? (
            <div className="catalog-load-more" data-testid="catalog-load-more">
              <p className="muted small catalog-load-more-count">
                {t('catalog.showingCount', { shown: items.length, total })}
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={loadingMore}
                onClick={loadMoreCatalogItems}
                data-testid="catalog-load-more-button"
              >
                {loadingMore ? t('catalog.loadingMore') : t('catalog.loadMore')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
