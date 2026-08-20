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
import {
  CatalogSortMenu,
  type CatalogSortOption,
} from '../components/CatalogSortMenu';
import { CatalogWearFilter } from '../components/CatalogWearFilter';
import { ErrorAlert } from '../components/ErrorAlert';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { TrustBanner } from '../components/TrustBanner';
import { useLocale } from '../i18n';
import {
  CATALOG_PAGE_LIMIT,
  decodeCategorySelection,
  encodeCategorySelection,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  type CategorySelectionMode,
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
  clearCatalogReturnState,
  parseCatalogPageParam,
  readCatalogReturnRestore,
  type CatalogReturnRestore,
} from '../utils/catalog-return-state';
import {
  applyCatalogScrollRestore,
  disableBrowserScrollRestoration,
} from '../utils/catalog-scroll-restore';
import {
  catalogSessionCoversPages,
  readCatalogSession,
  sliceCatalogSessionItems,
  writeCatalogSession,
} from '../utils/catalog-session-cache';
import {
  dedupeCatalogItems,
  mergeCatalogItems,
} from '../utils/catalog-load-more';

type SortOption = CatalogSortOption;

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

function getInitialCategorySelection(weaponParam: string | null): {
  tabId: string;
  mode: CategorySelectionMode;
  values: string[];
} {
  return decodeCategorySelection(weaponParam);
}

/** Keep chunks small so the first prices appear before Steam finishes the whole page. */
const STEAM_PRICE_CHUNK_SIZE = 8;
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
  const [inStock, setInStock] = useState(false);
  const loadedPage = parseCatalogPageParam(searchParams.get('page'));
  const pageLimit = CATALOG_PAGE_LIMIT;
  const pendingRestoreRef = useRef<CatalogReturnRestore | null | undefined>(undefined);
  if (pendingRestoreRef.current === undefined) {
    pendingRestoreRef.current = readCatalogReturnRestore();
  }
  const restoreCompletedRef = useRef(pendingRestoreRef.current == null);
  const popularPresentAtRestoreRef = useRef(false);
  const popularScrollCompensatedRef = useRef(false);
  const previousRestoreQueryKeyRef = useRef<string | null>(null);
  const [returnRestoreDone, setReturnRestoreDone] = useState(
    () => pendingRestoreRef.current == null,
  );
  const previousBaseQueryKeyRef = useRef<string | null>(null);
  const previousLoadedPageRef = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initialCategory = getInitialCategorySelection(weaponParam);
  const [activeTabId, setActiveTabId] = useState(initialCategory.tabId);
  const [categoryMode, setCategoryMode] = useState<CategorySelectionMode>(
    initialCategory.mode,
  );
  const [categoryValues, setCategoryValues] = useState(initialCategory.values);

  const categoryFilter = useMemo(
    () => resolveCatalogFilter(activeTabId, categoryValues, categoryMode),
    [activeTabId, categoryValues, categoryMode],
  );

  const baseQuery = useMemo(() => {
    const minMinor = minPrice ? parseUsdToMinor(minPrice) : undefined;
    const maxMinor = maxPrice ? parseUsdToMinor(maxPrice) : undefined;
    const parsedFloatMin = floatMin.trim() ? Number(floatMin) : undefined;
    const parsedFloatMax = floatMax.trim() ? Number(floatMax) : undefined;

    return {
      q: search.trim() || categoryFilter.q || undefined,
      marketHashName: search.trim()
        ? undefined
        : categoryFilter.marketHashName,
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
      inStock: inStock || undefined,
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
    inStock,
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
      categoryValues,
      categoryMode,
      wearFilter,
      floatMin,
      floatMax,
      skinTraitFilters,
    }) || Boolean(rarityFilter) || inStock;

  const popularSortSelected = sort === 'popular';
  const filtersActive = showResetFilters;
  const hasNonSortFilters =
    hasActiveCatalogFilters({
      search,
      sort: 'newest',
      minPrice,
      maxPrice,
      activeTabId,
      categoryValues,
      categoryMode,
      wearFilter,
      floatMin,
      floatMax,
      skinTraitFilters,
    }) || Boolean(rarityFilter) || inStock;
  const isInitialLoading = loading && items.length === 0;
  const isRefreshing = loading && items.length > 0;
  const showPopularSection =
    popularSortSelected &&
    !hasNonSortFilters &&
    !isInitialLoading &&
    !popularLoading &&
    popularItems.length > 0;

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
        inStock,
        activeTabId,
        categoryValues,
        categoryMode,
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
      inStock,
      activeTabId,
      categoryValues,
      categoryMode,
    ],
  );
  const previousCatalogFilterKeyRef = useRef(catalogFilterKey);
  const itemsRef = useRef(items);
  const popularItemsRef = useRef(popularItems);
  itemsRef.current = items;
  popularItemsRef.current = popularItems;

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

  useLayoutEffect(() => {
    const cached = readCatalogSession(baseQueryKey);
    if (!cached || !catalogSessionCoversPages(cached, loadedPage, pageLimit)) {
      return;
    }
    setItems(sliceCatalogSessionItems(cached, loadedPage, pageLimit));
    setTotal(cached.total);
    setSteamPrices((prev) => ({ ...cached.steamPrices, ...prev }));
    if (cached.steamPriceFetchedAt) {
      setSteamPriceFetchedAt(cached.steamPriceFetchedAt);
    }
    if (cached.popularItems.length > 0) {
      setPopularItems(cached.popularItems);
      setPopularLoading(false);
    }
    setLoading(false);
  }, [baseQueryKey, loadedPage, pageLimit]);

  useEffect(() => {
    let cancelled = false;
    const baseQueryChanged = previousBaseQueryKeyRef.current !== baseQueryKey;
    const priceSetters = {
      setSteamPrices,
      setPendingPriceNames,
      setSteamPriceFetchedAt,
    };

    async function persistSession(
      nextItems: CatalogItem[],
      nextTotal: number,
      nextPage: number,
      steamFetchedAt?: string | null,
      nextPopular?: CatalogItem[],
    ) {
      const seeded = buildPriceStateFromItems(nextItems);
      writeCatalogSession({
        queryKey: baseQueryKey,
        items: nextItems,
        total: nextTotal,
        steamPrices: seeded.steamPrices,
        steamPriceFetchedAt: steamFetchedAt ?? null,
        loadedPage: nextPage,
        pageLimit,
        popularItems: nextPopular ?? popularItemsRef.current,
        savedAt: Date.now(),
      });
    }

    async function fetchCatalogPages(
      fromPage: number,
      toPage: number,
      mode: 'replace' | 'append',
      options?: { silent?: boolean },
    ) {
      if (!options?.silent) {
        if (mode === 'append') {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);
      }

      try {
        if (toPage <= 1) {
          const response = await listCatalogItems({ ...baseQuery, page: 1 });
          if (cancelled) {
            return;
          }
          setItems(response.items);
          setTotal(response.total);
          applyCatalogPriceState(response.items, priceSetters, response.steamPriceFetchedAt);
          await persistSession(response.items, response.total, 1, response.steamPriceFetchedAt);
          return;
        }

        if (mode === 'append' && toPage > fromPage) {
          const response = await listCatalogItems({ ...baseQuery, page: toPage });
          if (cancelled) {
            return;
          }
          const merged = mergeCatalogItems(itemsRef.current, response.items);
          setItems(merged);
          setTotal(response.total);
          applyCatalogPriceState(response.items, priceSetters, response.steamPriceFetchedAt);
          await persistSession(merged, response.total, toPage, response.steamPriceFetchedAt);
          return;
        }

        const responses = await Promise.all(
          Array.from({ length: toPage }, (_, index) =>
            listCatalogItems({ ...baseQuery, page: index + 1 }),
          ),
        );
        if (cancelled) {
          return;
        }
        const mergedItems = dedupeCatalogItems(responses.flatMap((response) => response.items));
        const totalCount = responses.at(-1)?.total ?? mergedItems.length;
        const latestSteamPriceFetchedAt =
          responses
            .map((response) => response.steamPriceFetchedAt)
            .filter((value): value is string => Boolean(value))
            .at(-1) ?? null;
        setItems(mergedItems);
        setTotal(totalCount);
        applyCatalogPriceState(mergedItems, priceSetters, latestSteamPriceFetchedAt);
        await persistSession(mergedItems, totalCount, toPage, latestSteamPriceFetchedAt);
      } catch (err: unknown) {
        if (!cancelled && !options?.silent) {
          setError(err);
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    const coveringSession = readCatalogSession(baseQueryKey);

    if (baseQueryChanged) {
      const isInitialMount = previousLoadedPageRef.current === 0;
      const pagesToLoad = isInitialMount && loadedPage > 1 ? loadedPage : 1;
      previousBaseQueryKeyRef.current = baseQueryKey;
      previousLoadedPageRef.current = pagesToLoad;

      if (
        coveringSession &&
        catalogSessionCoversPages(coveringSession, pagesToLoad, pageLimit)
      ) {
        if (pagesToLoad <= 1) {
          void fetchCatalogPages(1, 1, 'replace', { silent: true });
        }
        return () => {
          cancelled = true;
          previousBaseQueryKeyRef.current = null;
          previousLoadedPageRef.current = 0;
        };
      }

      void fetchCatalogPages(1, pagesToLoad, 'replace');
      return () => {
        cancelled = true;
        previousBaseQueryKeyRef.current = null;
        previousLoadedPageRef.current = 0;
      };
    }

    if (loadedPage > previousLoadedPageRef.current) {
      const fromPage = previousLoadedPageRef.current;
      previousLoadedPageRef.current = loadedPage;
      if (
        coveringSession &&
        catalogSessionCoversPages(coveringSession, loadedPage, pageLimit)
      ) {
        return () => {
          cancelled = true;
          previousLoadedPageRef.current = fromPage;
        };
      }
      void fetchCatalogPages(fromPage, loadedPage, 'append');
      return () => {
        cancelled = true;
        previousLoadedPageRef.current = fromPage;
      };
    }

    if (loadedPage < previousLoadedPageRef.current) {
      previousLoadedPageRef.current = loadedPage;
      if (
        coveringSession &&
        catalogSessionCoversPages(coveringSession, loadedPage, pageLimit)
      ) {
        return () => {
          cancelled = true;
        };
      }
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

    if (loading) {
      return;
    }

    if (!returnRestoreDone) {
      return;
    }

    if (popularItems.length > 0) {
      setPopularLoading(false);
      return;
    }

    let cancelled = false;
    setPopularLoading(true);
    listPopularCatalogItems(12)
      .then((popular) => {
        if (!cancelled) {
          setPopularItems(popular);
          const cached = readCatalogSession(baseQueryKey);
          if (cached) {
            writeCatalogSession({ ...cached, popularItems: popular });
          }
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
  }, [popularSortSelected, hasNonSortFilters, popularItems.length, baseQueryKey, returnRestoreDone]);

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
    const next = decodeCategorySelection(weaponParam);
    setCategoryValues(next.values);
    setCategoryMode(next.mode);
    setActiveTabId(next.tabId);
  }, [weaponParam]);

  useEffect(() => {
    if (previousRestoreQueryKeyRef.current === null) {
      previousRestoreQueryKeyRef.current = baseQueryKey;
      const cached = readCatalogSession(baseQueryKey);
      if (!cached?.popularItems.length && pendingRestoreRef.current == null) {
        setPopularItems([]);
      }
      return;
    }
    if (previousRestoreQueryKeyRef.current === baseQueryKey) {
      return;
    }
    previousRestoreQueryKeyRef.current = baseQueryKey;
    pendingRestoreRef.current = null;
    restoreCompletedRef.current = true;
    if (!returnRestoreDone) {
      setReturnRestoreDone(true);
    }
    const cached = readCatalogSession(baseQueryKey);
    if (!cached?.popularItems.length) {
      setPopularItems([]);
    }
  }, [baseQueryKey, returnRestoreDone]);

  useLayoutEffect(() => {
    disableBrowserScrollRestoration();
    const restore = pendingRestoreRef.current;
    if (restoreCompletedRef.current || !restore) {
      return;
    }
    if (items.length === 0) {
      return;
    }

    popularPresentAtRestoreRef.current = popularItems.length > 0;
    const result = applyCatalogScrollRestore(restore);
    if (result === 'anchored' || !restore.anchorItemId) {
      pendingRestoreRef.current = null;
      restoreCompletedRef.current = true;
      clearCatalogReturnState();
      setReturnRestoreDone(true);
      return;
    }

    let cancelled = false;
    let frames = 0;
    const tick = () => {
      if (cancelled || restoreCompletedRef.current) {
        return;
      }
      frames += 1;
      const next = applyCatalogScrollRestore(restore);
      if (next === 'anchored' || frames >= 8) {
        pendingRestoreRef.current = null;
        restoreCompletedRef.current = true;
        clearCatalogReturnState();
        setReturnRestoreDone(true);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    const frame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [items.length, popularItems.length]);

  useLayoutEffect(() => {
    if (!returnRestoreDone || popularScrollCompensatedRef.current) {
      return;
    }
    if (popularPresentAtRestoreRef.current) {
      popularScrollCompensatedRef.current = true;
      return;
    }
    const popularSection = document.querySelector(
      '[data-testid="catalog-popular-section"]',
    );
    if (!popularSection) {
      return;
    }
    popularScrollCompensatedRef.current = true;
    window.scrollBy({
      top: (popularSection as HTMLElement).offsetHeight,
      behavior: 'instant',
    });
  }, [returnRestoreDone, popularItems.length, filtersActive]);

  const hasMoreItems = items.length < total;

  function handleCategorySelectionChange(next: {
    tabId: string;
    mode: CategorySelectionMode;
    values: string[];
  }) {
    setActiveTabId(next.tabId);
    setCategoryMode(next.mode);
    setCategoryValues(next.values);

    const nextParams = new URLSearchParams(searchParams);
    const paramValue = encodeCategorySelection(next.tabId, next.mode, next.values);
    if (paramValue) {
      nextParams.set('weapon', paramValue);
    } else {
      nextParams.delete('weapon');
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handleTabChange(tabId: string) {
    setActiveTabId(tabId);
    setCategoryMode('all');
    setCategoryValues([]);
    const nextParams = new URLSearchParams(searchParams);
    const paramValue = encodeCategorySelection(tabId, 'all', []);
    if (paramValue) {
      nextParams.set('weapon', paramValue);
    } else {
      nextParams.delete('weapon');
    }
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
    setInStock(false);
    setActiveTabId('all');
    setCategoryMode('all');
    setCategoryValues([]);
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
        <div className="field catalog-filter-field catalog-sort-field">
          <span className="sr-only">{t('catalog.sort')}</span>
          <CatalogSortMenu
            sort={sort}
            inStock={inStock}
            onSortChange={setSort}
            onInStockChange={setInStock}
          />
        </div>
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
          categoryMode={categoryMode}
          categoryValues={categoryValues}
          onTabChange={handleTabChange}
          onCategorySelectionChange={handleCategorySelectionChange}
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
              <p
                className="muted small catalog-load-more-count"
                data-testid="catalog-load-more-count"
              >
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
