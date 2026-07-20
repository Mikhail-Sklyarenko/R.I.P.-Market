import { useEffect, useMemo, useState } from 'react';
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
import {
  CATALOG_PAGE_LIMIT,
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

function mergeSteamPrices(
  response: Awaited<ReturnType<typeof getCatalogSteamPrices>>,
  names: string[],
): Record<string, number | null> {
  const next: Record<string, number | null> = {};
  for (const name of names) {
    next[name] = response.prices[name]?.priceMinor ?? null;
  }
  return next;
}

export function CatalogPage() {
  const { token } = useAuth();
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
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState(
    weaponParam ? findTabForWeapon(weaponParam) : 'all',
  );
  const [categoryValue, setCategoryValue] = useState(getInitialCategoryValue(weaponParam));

  const categoryFilter = useMemo(
    () => resolveCatalogFilter(activeTabId, categoryValue),
    [activeTabId, categoryValue],
  );

  const query = useMemo(() => {
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
      page,
      limit: CATALOG_PAGE_LIMIT,
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
    page,
    categoryFilter,
  ]);

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    listCatalogItems(query)
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        const seeded = buildPriceStateFromItems(response.items);
        setSteamPrices(seeded.steamPrices);
        setPendingPriceNames(seeded.pending);
        setSteamPriceFetchedAt(response.steamPriceFetchedAt ?? null);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    if (filtersActive) {
      setPopularItems([]);
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
  }, [filtersActive]);

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
      const response = await getCatalogSteamPrices(chunk);
      if (cancelled) {
        return {};
      }

      const chunkPrices = mergeSteamPrices(response, chunk);
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
    setPage(1);
  }, [search, sort, minPrice, maxPrice, rarityFilter, wearFilter, skinTraitFilters, floatMin, floatMax, activeTabId, categoryValue]);

  useEffect(() => {
    if (!weaponParam) {
      return;
    }
    const nextCategoryValue = getInitialCategoryValue(weaponParam);
    setCategoryValue(nextCategoryValue);
    setActiveTabId(findTabForWeapon(weaponParam));
  }, [weaponParam]);

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_LIMIT));
  const currentPage = Math.min(page, totalPages);

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
    setPage(1);
    setSearchParams({}, { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Каталог"
        subtitle="Все скины CS2, доступные к обмену — с ценами Steam и маркетплейса."
      />

      <TrustBanner />

      <div className="catalog-search-toolbar card" data-testid="catalog-search-toolbar">
        <div className="catalog-filters-row">
          <label className="field catalog-filter-field">
            <span className="field-label">Поиск</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название скина…"
              data-testid="catalog-search"
            />
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">Сортировка</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              data-testid="catalog-sort"
            >
              <option value="popular">Популярные</option>
              <option value="newest">Сначала новые</option>
              <option value="price-asc">Цена ↑</option>
              <option value="price-desc">Цена ↓</option>
            </select>
          </label>
        </div>

        {showResetFilters ? (
          <div className="catalog-filters-actions">
            <button
              type="button"
              className="button secondary sm"
              data-testid="catalog-reset-filters"
              onClick={handleResetFilters}
            >
              Сбросить фильтры
            </button>
          </div>
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
            Фильтры
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

        <div className="catalog-main">
          <ErrorAlert error={error} />

          {loading ? <LoadingState message="Загрузка каталога…" /> : null}

          {!loading ? (
            <>
              <p className="catalog-total" data-testid="catalog-total">
                Найдено скинов: {total}
              </p>
              {formatDataTimestamp(steamPriceFetchedAt) ? (
                <p className="muted small" data-testid="catalog-steam-price-updated-at">
                  Цены Steam обновлены: {formatDataTimestamp(steamPriceFetchedAt)}
                </p>
              ) : null}
            </>
          ) : null}

          {!loading && popularLoading ? (
            <p className="muted small" data-testid="catalog-popular-loading">
              Загрузка популярных предметов…
            </p>
          ) : null}

          {!loading && !popularLoading && popularItems.length > 0 ? (
            <section className="catalog-popular-section" data-testid="catalog-popular-section">
              <h2 className="catalog-section-title">Популярные и покупаемые</h2>
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

          {!loading && items.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              message="Измените фильтры или дождитесь появления новых предметов в каталоге."
            />
          ) : null}

          {!loading && items.length > 0 ? (
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

          {!loading && total > CATALOG_PAGE_LIMIT ? (
            <div className="catalog-pagination" data-testid="catalog-pagination">
              <button
                type="button"
                className="button secondary sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Назад
              </button>
              <span className="muted small">
                Страница {currentPage} из {totalPages}
              </span>
              <button
                type="button"
                className="button secondary sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Вперёд
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
