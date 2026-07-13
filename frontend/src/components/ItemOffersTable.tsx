import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lot } from '../api/types';
import { FloatSpectrum } from './FloatSpectrum';
import { LoadingState } from './LoadingState';
import { MoneyDisplay } from './MoneyDisplay';
import { resolveLotDisplayItem } from '../utils/lot-display';
import {
  formatOfferStickersSummary,
  sortItemOffers,
  type ItemOfferSort,
} from '../utils/item-offers-sort';

type ItemOffersTableProps = {
  lots: Lot[];
  loading?: boolean;
};

const SORT_OPTIONS: { value: ItemOfferSort; label: string }[] = [
  { value: 'price_asc', label: 'Цена ↑' },
  { value: 'price_desc', label: 'Цена ↓' },
  { value: 'float_asc', label: 'Float ↑' },
  { value: 'float_desc', label: 'Float ↓' },
  { value: 'newest', label: 'Новые' },
];

function formatListedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export function ItemOffersTable({ lots, loading = false }: ItemOffersTableProps) {
  const [sort, setSort] = useState<ItemOfferSort>('price_asc');
  const sortedLots = useMemo(() => sortItemOffers(lots, sort), [lots, sort]);

  return (
    <section className="card item-offers-table-card" data-testid="item-offers-section">
      <div className="item-offers-table-header">
        <div>
          <h2>Предложения продавцов</h2>
          <p className="muted small">
            Выберите конкретный лот, чтобы увидеть float, стикеры и оформить покупку.
          </p>
        </div>

        <label className="item-offers-sort">
          <span className="sr-only">Сортировка</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ItemOfferSort)}
            data-testid="item-offers-sort"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <LoadingState message="Загрузка предложений…" /> : null}

      {!loading && sortedLots.length === 0 ? (
        <p className="muted" data-testid="item-no-offers">
          Пока никто не продаёт этот предмет.
        </p>
      ) : null}

      {!loading && sortedLots.length > 0 ? (
        <div className="item-offers-table-wrap">
          <table className="item-offers-table" data-testid="item-offers-list">
            <thead>
              <tr>
                <th scope="col">Цена</th>
                <th scope="col">Float</th>
                <th scope="col">Стикеры</th>
                <th scope="col">Выставлен</th>
                <th scope="col">
                  <span className="sr-only">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedLots.map((lot) => {
                const display = resolveLotDisplayItem(lot);
                const hasFloat =
                  display.floatValue !== null &&
                  display.floatValue !== undefined &&
                  display.floatValue !== '';

                return (
                  <tr key={lot.id} data-testid={`item-offer-${lot.id}`}>
                    <td className="item-offers-table-price">
                      <MoneyDisplay minor={lot.priceMinor} strong />
                    </td>
                    <td className="item-offers-table-float">
                      {hasFloat ? (
                        <FloatSpectrum floatValue={display.floatValue!} variant="inline" />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="item-offers-table-stickers muted small">
                      {formatOfferStickersSummary(display.stickers)}
                    </td>
                    <td className="item-offers-table-date muted small">
                      {formatListedAt(lot.createdAt)}
                    </td>
                    <td className="item-offers-table-action">
                      <Link
                        to={`/lots/${lot.id}`}
                        className="button primary"
                        data-testid={`item-offer-open-${lot.id}`}
                      >
                        Открыть
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
