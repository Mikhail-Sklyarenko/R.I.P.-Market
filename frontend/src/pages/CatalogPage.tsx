import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listCatalogItems, listPopularCatalogItems, getCatalogSteamPrices } from '../api/marketplace';
import type { CatalogItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CatalogCategoryBar } from '../components/CatalogCategoryBar';
import { CatalogFloatRangeFilter } from '../components/CatalogFloatRangeFilter';
import { CatalogItemCard } from '../components/CatalogItemCard';
import { CatalogPriceRangeFilter } from '../components/CatalogPriceRangeFilter';
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
import { parseUsdToMinor } from '../utils/format';
import {
  CATALOG_RARITY_FILTERS,
  getRarityStyle,
} from '../utils/rarity-colors';
import {
  CATALOG_WEAR_FILTERS,
  getWearFilterTestId,
} from '../utils/wear-filters';
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

export function CatalogPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const weaponParam = searchParams.get('weapon');

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [popularItems, setPopularItems] = useState<CatalogItem[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(null);
  const [steamPrices, setSteamPrices] = useState<Record<string, number | null>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [wearFilter, setWearFilter] = useState('');
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
  }, [search, sort, minPrice, maxPrice, rarityFilter, wearFilter, floatMin, floatMax, page, categoryFilter]);

  const showResetFilters = hasActiveCatalogFilters({
    search,
    sort,
    minPrice,
    maxPrice,
    activeTabId,
    categoryValue,
    wearFilter,
    floatMin,
    floatMax,
  }) || Boolean(rarityFilter);

  const filtersActive = showResetFilters;

  useEffect(() => {
    setLoading(true);
    setError(null);
    listCatalogItems(query)
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        setSteamPriceFetchedAt(null);
        setSteamPrices({});
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
    const marketHashNames = [
      ...new Set(
        [...items, ...popularItems].map((item) => item.marketHashName).filter(Boolean),
      ),
    ];
    if (marketHashNames.length === 0) {
      setPricesLoading(false);
      return;
    }

    let cancelled = false;
    setPricesLoading(true);
    getCatalogSteamPrices(marketHashNames)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const nextPrices: Record<string, number | null> = {};
        for (const name of marketHashNames) {
          nextPrices[name] = response.prices[name]?.priceMinor ?? null;
        }
        setSteamPrices(nextPrices);
        setSteamPriceFetchedAt(response.steamPriceFetchedAt ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setSteamPrices({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPricesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, popularItems]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, minPrice, maxPrice, rarityFilter, wearFilter, floatMin, floatMax, activeTabId, categoryValue]);

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

      <div className="card catalog-toolbar" data-testid="catalog-filters">
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

        <CatalogCategoryBar
          activeTabId={activeTabId}
          categoryValue={categoryValue}
          onTabChange={handleTabChange}
          onCategoryChange={handleCategoryChange}
        />

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

            <fieldset className="catalog-sidebar-section">
              <legend className="field-label">Редкость</legend>
              <div className="catalog-rarity-filters" role="group" aria-label="Фильтр редкости">
                <button
                  type="button"
                  className={`catalog-rarity-filter${rarityFilter === '' ? ' active' : ''}`}
                  data-testid="catalog-rarity-all"
                  onClick={() => setRarityFilter('')}
                >
                  Все
                </button>
                {CATALOG_RARITY_FILTERS.map((option) => {
                  const style = getRarityStyle(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`catalog-rarity-filter${rarityFilter === option.value ? ' active' : ''}`}
                      data-testid={`catalog-rarity-${option.value.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => setRarityFilter(option.value)}
                    >
                      <span
                        className="catalog-rarity-dot"
                        style={{ backgroundColor: style.color, boxShadow: `0 0 8px ${style.glow}` }}
                        aria-hidden="true"
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <CatalogFloatRangeFilter
              floatMin={floatMin}
              floatMax={floatMax}
              onFloatMinChange={setFloatMin}
              onFloatMaxChange={setFloatMax}
            />

            <fieldset className="catalog-sidebar-section">
              <legend className="field-label">Износ</legend>
              <div className="catalog-rarity-filters" role="group" aria-label="Фильтр износа">
                <button
                  type="button"
                  className={`catalog-rarity-filter${wearFilter === '' ? ' active' : ''}`}
                  data-testid="catalog-wear-all"
                  onClick={() => setWearFilter('')}
                >
                  Все
                </button>
                {CATALOG_WEAR_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`catalog-rarity-filter${wearFilter === option.value ? ' active' : ''}`}
                    data-testid={getWearFilterTestId(option.value)}
                    onClick={() => setWearFilter(option.value)}
                  >
                    <span
                      className="catalog-rarity-dot"
                      style={{ backgroundColor: option.color, boxShadow: `0 0 8px ${option.color}88` }}
                      aria-hidden="true"
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
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
                    pricesLoading={pricesLoading}
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
                  pricesLoading={pricesLoading}
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
