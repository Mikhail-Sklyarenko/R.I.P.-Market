import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  cancelBuyRequest,
  createBuyRequest,
  getCatalogItem,
  listLots,
  listMyBuyRequests,
} from '../api/marketplace';
import type { BuyRequest, CatalogItem, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryPriceStack } from '../components/InventoryPriceStack';
import { ItemCompareHeader } from '../components/ItemCompareHeader';
import { ItemOffersTable } from '../components/ItemOffersTable';
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { MoneyDisplay } from '../components/MoneyDisplay';
import {
  resolveSingleLotId,
  shouldRedirectItemPageToLot,
} from '../utils/catalog-navigation';
import { getRarityDisplayLabel } from '../utils/rarity-colors';
import { parseUsdToMinor } from '../utils/format';

export function ItemPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [buyRequest, setBuyRequest] = useState<BuyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxPriceInput, setMaxPriceInput] = useState('');

  const maxPriceMinor = useMemo(() => parseUsdToMinor(maxPriceInput), [maxPriceInput]);
  const hasOffers = (item?.activeLotCount ?? 0) > 0;
  const isComparisonPage = hasOffers && (item?.activeLotCount ?? 0) > 1;
  const openBuyRequest = buyRequest?.status === 'OPEN' ? buyRequest : null;
  const cheapestLot = lots[0] ?? null;

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError(null);
    getCatalogItem(id)
      .then(setItem)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLotsLoading(true);
    listLots({ itemDefinitionId: id, sort: 'price_asc', limit: 24, page: 1 })
      .then((page) => setLots(page.items))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!token || !id) {
      setBuyRequest(null);
      return;
    }
    listMyBuyRequests(token, id)
      .then((requests) => {
        setBuyRequest(requests.find((request) => request.status === 'OPEN') ?? requests[0] ?? null);
      })
      .catch(() => setBuyRequest(null));
  }, [token, id]);

  useEffect(() => {
    if (!item || lotsLoading) {
      return;
    }
    if (!shouldRedirectItemPageToLot(item, lots.length)) {
      return;
    }
    const lotId = resolveSingleLotId(item, lots);
    if (lotId) {
      navigate(`/lots/${lotId}`, { replace: true });
    }
  }, [item, lots, lotsLoading, navigate]);

  async function handleCreateBuyRequest() {
    if (!token || !id) {
      navigate(`/login?returnUrl=${encodeURIComponent(`/catalog/items/${id}`)}`);
      return;
    }
    if (maxPriceInput.trim() && !maxPriceMinor) {
      setRequestError(new Error('Укажите корректную максимальную цену в USD.'));
      return;
    }

    setSubmitting(true);
    setRequestError(null);
    try {
      const created = await createBuyRequest(token, id, {
        maxPriceMinor: maxPriceMinor ?? undefined,
      });
      setBuyRequest(created);
      setMaxPriceInput('');
    } catch (err: unknown) {
      setRequestError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelBuyRequest() {
    if (!token || !openBuyRequest) {
      return;
    }
    setSubmitting(true);
    setRequestError(null);
    try {
      const updated = await cancelBuyRequest(token, openBuyRequest.id);
      setBuyRequest(updated);
    } catch (err: unknown) {
      setRequestError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!id) {
    return null;
  }

  const redirectingToSingleLot =
    item &&
    !lotsLoading &&
    shouldRedirectItemPageToLot(item, lots.length) &&
    Boolean(resolveSingleLotId(item, lots));

  if (redirectingToSingleLot) {
    return <LoadingState message="Открываем предложение…" />;
  }

  return (
    <div className="page item-page" data-testid="item-page">
      {loading ? <LoadingState message="Загрузка предмета…" /> : null}
      <ErrorAlert error={error} />

      {item ? (
        <>
          <LotBreadcrumbs
            marketHashName={item.marketHashName}
            weapon={item.weapon}
            categoryLabel={getRarityDisplayLabel(item.rarity)}
          />

          <div className={`item-compare-layout${isComparisonPage ? '' : ' item-compare-layout-single'}`}>
            <div className="item-compare-main">
              <ItemCompareHeader item={item} />

              {isComparisonPage ? <ItemOffersTable lots={lots} loading={lotsLoading} /> : null}

              {!hasOffers ? (
                <section className="card item-buy-request-card" data-testid="item-buy-request-panel">
                  <h2>Заявка на покупку</h2>
                  <p className="muted">
                    Пока никто не продаёт этот предмет. Оставьте заявку — мы уведомим вас, когда
                    появится подходящий лот.
                  </p>

                  {openBuyRequest ? (
                    <div className="item-buy-request-active" data-testid="item-buy-request-active">
                      <p>
                        Заявка активна
                        {openBuyRequest.maxPriceMinor ? (
                          <>
                            {' '}
                            до <MoneyDisplay minor={openBuyRequest.maxPriceMinor} strong />
                          </>
                        ) : (
                          ' без ограничения цены'
                        )}
                        .
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={submitting}
                        data-testid="item-buy-request-cancel"
                        onClick={handleCancelBuyRequest}
                      >
                        Отменить заявку
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="form-field">
                        <span>Максимальная цена, USD (необязательно)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Например, 25.00"
                          value={maxPriceInput}
                          onChange={(event) => setMaxPriceInput(event.target.value)}
                          data-testid="item-buy-request-max-price"
                        />
                      </label>
                      <ErrorAlert error={requestError} />
                      <button
                        type="button"
                        className="button primary lot-purchase-button"
                        disabled={submitting}
                        data-testid="item-buy-request-submit"
                        onClick={handleCreateBuyRequest}
                      >
                        {token ? 'Оставить заявку на покупку' : 'Войти и оставить заявку'}
                      </button>
                      <p className="muted small">
                        Активные заявки — во вкладке{' '}
                        <Link to="/deals?tab=requests">Сделки → Заявки</Link>.
                      </p>
                    </>
                  )}
                </section>
              ) : null}
            </div>

            {isComparisonPage ? (
              <aside className="item-compare-sidebar">
                <div className="card lot-purchase-card item-purchase-card">
                  <p className="item-purchase-label muted small">Лучшее предложение</p>
                  <div data-testid="item-market-price">
                    <InventoryPriceStack
                      steamPriceMinor={item.steamPriceMinor}
                      marketplacePriceMinor={cheapestLot?.priceMinor ?? item.minMarketplacePriceMinor}
                      testIdPrefix="item"
                    />
                  </div>

                  {cheapestLot ? (
                    <Link
                      to={`/lots/${cheapestLot.id}`}
                      className="button primary lot-purchase-button"
                      data-testid="item-open-cheapest"
                    >
                      Открыть лучшее предложение
                    </Link>
                  ) : null}

                  <p className="muted small">
                    Float, стикеры и inspect доступны на странице конкретного лота.
                  </p>
                </div>
              </aside>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
