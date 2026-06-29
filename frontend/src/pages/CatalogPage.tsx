import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { parseUsdToMinor } from '../utils/format';

const PAGE_SIZE = 24;

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

export function CatalogPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const minMinor = minPrice ? parseUsdToMinor(minPrice) : undefined;
    const maxMinor = maxPrice ? parseUsdToMinor(maxPrice) : undefined;

    return {
      q: search.trim() || undefined,
      minPriceMinor: minMinor ?? undefined,
      maxPriceMinor: maxMinor ?? undefined,
      sort: toApiSort(sort),
      page,
      limit: PAGE_SIZE,
    };
  }, [search, sort, minPrice, maxPrice, page]);

  useEffect(() => {
    setLoading(true);
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
  }, [search, sort, minPrice, maxPrice]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

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
        </div>
      </div>

      <ErrorAlert error={error} />

      {loading ? <LoadingState message="Загрузка каталога…" /> : null}

      {!loading && lots.length === 0 ? (
        <EmptyState
          title="Пока нет лотов"
          message="Продавцы ещё не выставили предметы или ничего не найдено по фильтрам."
        />
      ) : null}

      <div className="grid" data-testid="catalog-grid">
        {lots.map((lot) => (
          <article key={lot.id} className="card item-card" data-testid={`catalog-lot-${lot.id}`}>
            <ItemPreview
              item={lot.inventoryAsset}
              title={lot.inventoryAsset.itemDefinition.marketHashName}
              size="sm"
            />
            <div className="item-card-header">
              <StatusBadge status={lot.status} />
            </div>
            <p>
              <MoneyDisplay minor={lot.priceMinor} strong />
            </p>
            <Link className="button primary" to={`/lots/${lot.id}`}>
              View listing
            </Link>
          </article>
        ))}
      </div>

      {!loading && total > PAGE_SIZE ? (
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
