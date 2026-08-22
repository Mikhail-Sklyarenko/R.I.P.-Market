import { Link } from 'react-router-dom';
import type { ItemOrderBook as ItemOrderBookData } from '../api/types';
import { useLocale, wearLabel } from '../i18n';
import { LoadingState } from './LoadingState';
import { MoneyDisplay } from './MoneyDisplay';

type ItemOrderBookProps = {
  orderBook: ItemOrderBookData | null;
  loading?: boolean;
  showSellHint?: boolean;
  /** When true, hide the bids column if there are no buy requests. */
  hideEmptyBids?: boolean;
  /** When true, hide the asks column if there are no listings. */
  hideEmptyAsks?: boolean;
  /** Lighter layout for embedding under the item preview. */
  variant?: 'default' | 'compact';
};

function formatFloat(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(4);
}

export function ItemOrderBook({
  orderBook,
  loading = false,
  showSellHint = false,
  hideEmptyBids = false,
  hideEmptyAsks = false,
  variant = 'default',
}: ItemOrderBookProps) {
  const { locale, t } = useLocale();
  const isCompact = variant === 'compact';
  const cardClassName = `card item-order-book-card${
    isCompact ? ' item-order-book-compact' : ''
  }`;

  if (loading) {
    return (
      <section className={cardClassName} data-testid="item-order-book">
        <LoadingState message={t('orderBook.loading')} />
      </section>
    );
  }

  if (!orderBook) {
    return null;
  }

  const totalBidQuantity = orderBook.bids.reduce(
    (sum, level) => sum + level.quantity,
    0,
  );
  const hasBids = orderBook.bids.length > 0;
  const hasAsks = orderBook.asksSummary.count > 0;
  const showBidsColumn = hasBids || !hideEmptyBids;
  const showAsksColumn = hasAsks || !hideEmptyAsks;
  const singleColumn = showBidsColumn !== showAsksColumn;

  if (!showBidsColumn && !showAsksColumn) {
    return null;
  }

  if (!hasBids && !hasAsks && !isCompact) {
    return (
      <section
        className={`${cardClassName} item-order-book-empty`}
        data-testid="item-order-book"
      >
        <div className="item-order-book-header">
          <div>
            <h2>{t('orderBook.title')}</h2>
            <p className="muted small">{t('orderBook.subtitle')}</p>
          </div>
        </div>
        <p className="muted" data-testid="item-order-book-empty">
          {t('orderBook.empty')}
        </p>
      </section>
    );
  }

  return (
    <section className={cardClassName} data-testid="item-order-book">
      {!isCompact ? (
        <div className="item-order-book-header">
          <div>
            <h2>{t('orderBook.title')}</h2>
            <p className="muted small">{t('orderBook.subtitle')}</p>
          </div>
          {orderBook.bestBidMinor && orderBook.bestAskMinor ? (
            <p className="item-order-book-spread muted small" data-testid="item-order-book-spread">
              {t('orderBook.spread')}: <MoneyDisplay minor={orderBook.spreadMinor ?? '0'} />
            </p>
          ) : null}
        </div>
      ) : (
        <div className="item-order-book-compact-header">
          <h3 className="item-order-book-compact-title">{t('orderBook.title')}</h3>
          {orderBook.bestBidMinor && orderBook.bestAskMinor ? (
            <p className="item-order-book-spread muted small" data-testid="item-order-book-spread">
              {t('orderBook.spread')}: <MoneyDisplay minor={orderBook.spreadMinor ?? '0'} />
            </p>
          ) : null}
        </div>
      )}

      {showSellHint && hasBids ? (
        <p
          className={`item-order-book-sell-hint${
            isCompact ? ' item-order-book-sell-hint-compact' : ''
          }`}
          data-testid="item-order-book-sell-hint"
        >
          {t('orderBook.sellHintPrefix', { count: totalBidQuantity })}{' '}
          <MoneyDisplay minor={orderBook.bestBidMinor ?? '0'} strong />
          {'. '}
          <Link to="/sell/inventory" className="text-link">
            {t('orderBook.sellLink')}
          </Link>
        </p>
      ) : null}

      <div
        className={`item-order-book-grid${
          singleColumn ? ' item-order-book-grid-single' : ''
        }${showBidsColumn ? '' : ' item-order-book-grid-asks-only'}`}
      >
        {showBidsColumn ? (
        <div className="item-order-book-side item-order-book-bids" data-testid="item-order-book-bids">
          <h3 className="item-order-book-side-title">{t('orderBook.bidsTitle')}</h3>
          {!hasBids ? (
            <p className="muted small" data-testid="item-order-book-no-bids">
              {t('orderBook.noBids')}
            </p>
          ) : (
            <table className="item-order-book-table">
              <thead>
                <tr>
                  <th>{t('orderBook.colPrice')}</th>
                  <th>{t('orderBook.colQty')}</th>
                </tr>
              </thead>
              <tbody>
                {orderBook.bids.map((level) => (
                  <tr
                    key={level.priceMinor}
                    data-testid={`item-order-book-bid-${level.priceMinor}`}
                  >
                    <td className="item-order-book-price item-order-book-price-bid">
                      <MoneyDisplay minor={level.priceMinor} strong />
                    </td>
                    <td className="muted small">
                      {t('orderBook.quantityShort', { count: level.quantity })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        ) : null}

        {showAsksColumn ? (
        <div className="item-order-book-side item-order-book-asks" data-testid="item-order-book-asks">
          <h3 className="item-order-book-side-title">{t('orderBook.asksTitle')}</h3>
          {!hasAsks ? (
            <p className="muted small" data-testid="item-order-book-no-asks">
              {t('orderBook.noAsks')}
            </p>
          ) : (
            <>
              {orderBook.asksSummary.minPriceMinor ? (
                <p className="muted small item-order-book-asks-summary">
                  {t('orderBook.asksSummary', {
                    count: orderBook.asksSummary.count,
                  })}
                  {' · '}
                  {t('orderBook.fromPrice')}{' '}
                  <MoneyDisplay minor={orderBook.asksSummary.minPriceMinor} />
                </p>
              ) : null}
              <table className="item-order-book-table">
                <thead>
                  <tr>
                    <th>{t('orderBook.colPrice')}</th>
                    <th>{t('orderBook.colFloat')}</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {orderBook.asks.map((ask) => (
                    <tr key={ask.lotId} data-testid={`item-order-book-ask-${ask.lotId}`}>
                      <td className="item-order-book-price item-order-book-price-ask">
                        <MoneyDisplay minor={ask.priceMinor} strong />
                      </td>
                      <td className="muted small">
                        {formatFloat(ask.floatValue)}
                        {ask.wear ? (
                          <span className="item-order-book-wear">
                            {' '}
                            · {wearLabel(ask.wear, locale)}
                          </span>
                        ) : null}
                      </td>
                      <td className="item-order-book-action">
                        <Link
                          to={`/lots/${ask.lotId}`}
                          className="button secondary sm"
                          data-testid={`item-order-book-open-${ask.lotId}`}
                        >
                          {t('orderBook.openLot')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        ) : null}
      </div>
    </section>
  );
}
