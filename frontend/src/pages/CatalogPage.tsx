import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { ErrorAlert } from '../components/ErrorAlert';
import { EmptyState } from '../components/EmptyState';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { TrustBanner } from '../components/TrustBanner';
import {
  CATALOG_CATEGORY_OPTIONS,
  CATALOG_PAGE_LIMITS,
  findCategoryOption,
  findTabForWeapon,
  hasActiveCatalogFilters,
  resolveCatalogFilter,
  WEAPON_CATEGORY_TABS,
  type CatalogPageLimit,
} from '../utils/catalog-filters';
import { parseUsdToMinor } from '../utils/format';
import { formatLotStatus } from '../utils/seller-flow';

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
  const [page, setPage] = useState(1);
  const [pageLimit, setPageLimit] = useState<CatalogPageLimit>(24);
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
      rarity: categoryFilter.rarity,
      sort: toApiSort(sort),
      page,
      limit: pageLimit,
    };
  }, [search, sort, minPrice, maxPrice, page, pageLimit, categoryFilter]);

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
  }, [search, sort, minPrice, maxPrice, activeTabId, categoryValue, pageLimit]);

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
  });

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

      <div className="card catalog-filters" data-testid="catalog-filters">
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
            <span className="field-label">Категория</span>
            <select
              value={categoryValue}
              onChange={(event) => handleCategoryChange(event.target.value)}
              data-testid="catalog-category"
            >
              {CATALOG_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <span className="field-label">Цена от ($)</span>
            <input
              type="text"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              data-testid="catalog-min-price"
            />
          </label>
          <label className="field catalog-filter-field">
            <span className="field-label">Цена до ($)</span>
            <input
              type="text"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              data-testid="catalog-max-price"
            />
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

        <div className="catalog-category-tabs" role="tablist" aria-label="Категории оружия">
          {WEAPON_CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={`catalog-category-tab${activeTabId === tab.id ? ' active' : ''}`}
              data-testid={`catalog-category-tab-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
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
        <div className="grid" data-testid="catalog-grid">
          {lots.map((lot) => (
            <article key={lot.id} className="card item-card" data-testid={`catalog-lot-${lot.id}`}>
              <ItemPreview
                item={lot.inventoryAsset}
                title={lot.inventoryAsset.itemDefinition.marketHashName}
                size="sm"
                showAttrs
              />
              <div className="item-card-header">
                <StatusBadge status={lot.status} label={formatLotStatus(lot.status)} />
              </div>
              <p className="catalog-lot-price">
                <MoneyDisplay minor={lot.priceMinor} strong />
              </p>
              <Link
                className="button primary"
                to={`/lots/${lot.id}`}
                data-testid="catalog-open-lot"
              >
                Открыть
              </Link>
            </article>
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
  );
}
