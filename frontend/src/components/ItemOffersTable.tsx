import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lot } from '../api/types';
import { useLocale } from '../i18n';
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

function formatListedAt(value: string, locale: 'ru' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export function ItemOffersTable({ lots, loading = false }: ItemOffersTableProps) {
  const { locale, t } = useLocale();
  const [sort, setSort] = useState<ItemOfferSort>('price_asc');
  const sortedLots = useMemo(() => sortItemOffers(lots, sort), [lots, sort]);

  const sortOptions: { value: ItemOfferSort; label: string }[] = [
    { value: 'price_asc', label: t('itemOffers.sortPriceAsc') },
    { value: 'price_desc', label: t('itemOffers.sortPriceDesc') },
    { value: 'float_asc', label: t('itemOffers.sortFloatAsc') },
    { value: 'float_desc', label: t('itemOffers.sortFloatDesc') },
    { value: 'newest', label: t('itemOffers.sortNewest') },
  ];

  return (
    <section className="card item-offers-table-card" data-testid="item-offers-section">
      <div className="item-offers-table-header">
        <div>
          <h2>{t('itemOffers.title')}</h2>
          <p className="muted small">{t('itemOffers.subtitle')}</p>
        </div>

        <label className="item-offers-sort">
          <span className="sr-only">{t('itemOffers.sortAria')}</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ItemOfferSort)}
            data-testid="item-offers-sort"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <LoadingState message={t('itemOffers.loading')} /> : null}

      {!loading && sortedLots.length === 0 ? (
        <p className="muted" data-testid="item-no-offers">
          {t('itemOffers.empty')}
        </p>
      ) : null}

      {!loading && sortedLots.length > 0 ? (
        <div className="item-offers-table-wrap">
          <table className="item-offers-table" data-testid="item-offers-list">
            <thead>
              <tr>
                <th scope="col">{t('itemOffers.colPrice')}</th>
                <th scope="col">{t('itemOffers.colFloat')}</th>
                <th scope="col">{t('itemOffers.colStickers')}</th>
                <th scope="col">{t('itemOffers.colListed')}</th>
                <th scope="col">
                  <span className="sr-only">{t('itemOffers.open')}</span>
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
                      {formatOfferStickersSummary(display.stickers, locale)}
                    </td>
                    <td className="item-offers-table-date muted small">
                      {formatListedAt(lot.createdAt, locale)}
                    </td>
                    <td className="item-offers-table-action">
                      <Link
                        to={`/lots/${lot.id}`}
                        className="button primary"
                        data-testid={`item-offer-open-${lot.id}`}
                      >
                        {t('itemOffers.open')}
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
