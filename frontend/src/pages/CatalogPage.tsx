import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CatalogCategoryBar } from '../components/CatalogCategoryBar';
import { CatalogLotCard } from '../components/CatalogLotCard';
import { ErrorAlert } from '../components/ErrorAlert';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { TrustBanner } from '../components/TrustBanner';
import {
  CATALOG_PAGE_LIMITS,
  findCategoryOption,
  findTabForWeapon,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  type CatalogPageLimit,
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

type SortOption = 'newest' | 'price-asc' | 'price-desc';

function toApiSort(sort: SortOption): 'newest' | 'price_asc' | 'price_desc' {
  if (sort === 'price-asc') {
    return 'price_asc';
  }
  if (sort === 'price-desc') {
    return 'price_desc';
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

  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [wearFilter, setWearFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageLimit, setPageLimit] = useState<CatalogPageLimit>(24);
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

    return {
      q: search.trim() || categoryFilter.q || undefined,
      minPriceMinor: minMinor ?? undefined,
      maxPriceMinor: maxMinor ?? undefined,
      weapon: categoryFilter.weapon,
      rarity: rarityFilter || categoryFilter.rarity,
      wear: wearFilter || undefined,
      sort: toApiSort(sort),
      page,
      limit: pageLimit,
    };
  }, [search, sort, minPrice, maxPrice, rarityFilter, wearFilter, page, pageLimit, categoryFilter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLots(query)
      .then((response) => {
        setLots(response.items);
        setTotal(response.total);
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, minPrice, maxPrice, rarityFilter, wearFilter, activeTabId, categoryValue, pageLimit]);

  useEffect(() => {
    if (!weaponParam) {
      return;
    }
    const nextCategoryValue = getInitialCategoryValue(weaponParam);
    setCategoryValue(nextCategoryValue);
    setActiveTabId(findTabForWeapon(weaponParam));
  }, [weaponParam]);

  const totalPages = Math.max(1, Math.ceil(total / pageLimit));
  const currentPage = Math.min(page, totalPages);
  const showResetFilters = hasActiveCatalogFilters({
    search,
    sort,
    minPrice,
    maxPrice,
    activeTabId,
    categoryValue,
    wearFilter,
  }) || Boolean(rarityFilter);

  function handleCategoryChange(value: string) {
    setCategoryValue(value);
    const option = findCategoryOption(value);
    if (option && option.tabId !== 'all') {
      setActiveTabId(option.tabId);
    } else if (!value) {
      setActiveTabId('all');
    }

    const nextParams = new URLSearchParams(searchParams);
    const weapon = option?.weapon;
    if (weapon) {
      nextParams.set('weapon', weapon);
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
    setActiveTabId('all');
    setCategoryValue('');
    setPage(1);
    setPageLimit(24);
    setSearchParams({}, { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Каталог"
        subtitle="Активные лоты, доступные для покупки."
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
              <option value="newest">Сначала новые</option>
              <option value="price-asc">Цена ↑</option>
              <option value="price-desc">Цена ↓</option>
            </select>
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">На странице</span>
            <select
              value={pageLimit}
              onChange={(event) => setPageLimit(Number(event.target.value) as CatalogPageLimit)}
              data-testid="catalog-page-limit"
            >
              {CATALOG_PAGE_LIMITS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
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
            <fieldset className="catalog-sidebar-section">
              <legend className="field-label">Цена ($)</legend>
              <div className="catalog-sidebar-price-fields">
                <label className="field catalog-filter-field">
                  <span className="field-label">От</span>
                  <input
                    type="text"
                    value={minPrice}
                    onChange={(event) => setMinPrice(event.target.value)}
                    data-testid="catalog-min-price"
                  />
                </label>
                <label className="field catalog-filter-field">
                  <span className="field-label">До</span>
                  <input
                    type="text"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    data-testid="catalog-max-price"
                  />
                </label>
              </div>
            </fieldset>

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
            <p className="catalog-total" data-testid="catalog-total">
              Найдено лотов: {total}
            </p>
          ) : null}

          {!loading && lots.length === 0 ? (
            <EmptyState
              title="Пока нет лотов"
              message="Продавцы ещё не выставили предметы или ничего не найдено по фильтрам."
            />
          ) : null}

          {!loading && lots.length > 0 ? (
            <div className="catalog-grid" data-testid="catalog-grid">
              {lots.map((lot) => (
                <CatalogLotCard key={lot.id} lot={lot} isLoggedIn={Boolean(token)} />
              ))}
            </div>
          ) : null}

          {!loading && total > pageLimit ? (
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
