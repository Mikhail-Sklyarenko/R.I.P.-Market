import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Lot } from '../api/types';
import { useLocale } from '../i18n';
import { FloatSpectrum } from './FloatSpectrum';
import { LoadingState } from './LoadingState';
import { MoneyDisplay } from './MoneyDisplay';
import { resolveLotDisplayItem } from '../utils/lot-display';
import {
  resolveItemOffersColumns,
  type ItemMarketInput,
} from '../utils/item-market-taxonomy';
import {
  clampItemOfferSort,
  formatOfferStickersSummary,
  resolveItemOfferSortOptions,
  sortItemOffers,
  type ItemOfferSort,
} from '../utils/item-offers-sort';

type ItemOffersTableProps = {
  lots: Lot[];
  loading?: boolean;
  /** Catalog identity used to hide float/stickers for fungible items. */
  market?: ItemMarketInput;
  /**
   * When set, rows are selectable for in-place buy on the item page.
   * Clicking a row selects it; optional details link still opens the lot dossier.
   */
  selectedLotId?: string | null;
  onSelectLot?: (lotId: string) => void;
  selectable?: boolean;
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

const SORT_LABEL_KEYS: Record<ItemOfferSort, string> = {
  price_asc: 'itemOffers.sortPriceAsc',
  price_desc: 'itemOffers.sortPriceDesc',
  float_asc: 'itemOffers.sortFloatAsc',
  float_desc: 'itemOffers.sortFloatDesc',
  newest: 'itemOffers.sortNewest',
};

export function ItemOffersTable({
  lots,
  loading = false,
  market,
  selectedLotId = null,
  onSelectLot,
  selectable = false,
}: ItemOffersTableProps) {
  const { locale, t } = useLocale();
  const [sort, setSort] = useState<ItemOfferSort>('price_asc');
  const columns = useMemo(
    () => resolveItemOffersColumns(market ?? {}, lots),
    [market, lots],
  );
  const sortKeys = useMemo(
    () => resolveItemOfferSortOptions(columns.showFloat),
    [columns.showFloat],
  );
  const effectiveSort = clampItemOfferSort(sort, columns.showFloat);
  const sortedLots = useMemo(
    () => sortItemOffers(lots, effectiveSort),
    [lots, effectiveSort],
  );

  return (
    <section className="card item-offers-table-card" data-testid="item-offers-section">
      <div className="item-offers-table-header">
        <div>
          <h2>{t('itemOffers.title')}</h2>
          <p className="muted small">
            {selectable ? t('itemOffers.subtitleSelect') : t('itemOffers.subtitle')}
          </p>
        </div>

        <label className="item-offers-sort">
          <span className="sr-only">{t('itemOffers.sortAria')}</span>
          <select
            value={effectiveSort}
            onChange={(event) => setSort(event.target.value as ItemOfferSort)}
            data-testid="item-offers-sort"
          >
            {sortKeys.map((option) => (
              <option key={option} value={option}>
                {t(SORT_LABEL_KEYS[option])}
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
          <table
            className={`item-offers-table${selectable ? ' item-offers-table-selectable' : ''}`}
            data-testid="item-offers-list"
            data-show-float={columns.showFloat ? 'true' : 'false'}
            data-show-stickers={columns.showStickers ? 'true' : 'false'}
            data-selectable={selectable ? 'true' : 'false'}
          >
            <thead>
              <tr>
                <th scope="col">{t('itemOffers.colPrice')}</th>
                {columns.showFloat ? (
                  <th scope="col">{t('itemOffers.colFloat')}</th>
                ) : null}
                {columns.showStickers ? (
                  <th scope="col">{t('itemOffers.colStickers')}</th>
                ) : null}
                <th scope="col">{t('itemOffers.colListed')}</th>
                <th scope="col">
                  <span className="sr-only">
                    {selectable ? t('itemOffers.select') : t('itemOffers.open')}
                  </span>
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
                const isSelected = selectable && selectedLotId === lot.id;

                return (
                  <tr
                    key={lot.id}
                    data-testid={`item-offer-${lot.id}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={isSelected ? 'item-offers-row-selected' : undefined}
                    onClick={
                      selectable && onSelectLot
                        ? () => onSelectLot(lot.id)
                        : undefined
                    }
                    onKeyDown={
                      selectable && onSelectLot
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectLot(lot.id);
                            }
                          }
                        : undefined
                    }
                    tabIndex={selectable ? 0 : undefined}
                    role={selectable ? 'button' : undefined}
                    aria-pressed={selectable ? isSelected : undefined}
                  >
                    <td className="item-offers-table-price">
                      <MoneyDisplay minor={lot.priceMinor} strong />
                    </td>
                    {columns.showFloat ? (
                      <td className="item-offers-table-float">
                        {hasFloat ? (
                          <FloatSpectrum floatValue={display.floatValue!} variant="inline" />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    ) : null}
                    {columns.showStickers ? (
                      <td className="item-offers-table-stickers muted small">
                        {formatOfferStickersSummary(display.stickers, locale)}
                      </td>
                    ) : null}
                    <td className="item-offers-table-date muted small">
                      {formatListedAt(lot.createdAt, locale)}
                    </td>
                    <td className="item-offers-table-action">
                      {selectable ? (
                        <div className="item-offers-row-actions">
                          <button
                            type="button"
                            className={`button sm${isSelected ? ' primary' : ' secondary'}`}
                            data-testid={`item-offer-select-${lot.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectLot?.(lot.id);
                            }}
                          >
                            {isSelected ? t('itemOffers.selected') : t('itemOffers.select')}
                          </button>
                          <Link
                            to={`/lots/${lot.id}`}
                            className="text-link muted small"
                            data-testid={`item-offer-open-${lot.id}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {t('itemOffers.details')}
                          </Link>
                        </div>
                      ) : (
                        <Link
                          to={`/lots/${lot.id}`}
                          className="button primary"
                          data-testid={`item-offer-open-${lot.id}`}
                        >
                          {t('itemOffers.open')}
                        </Link>
                      )}
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
