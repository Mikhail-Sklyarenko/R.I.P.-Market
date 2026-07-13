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
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotItemHero } from '../components/LotItemHero';
import { MoneyDisplay } from '../components/MoneyDisplay';
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
  const openBuyRequest = buyRequest?.status === 'OPEN' ? buyRequest : null;

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

  const displayItem = item
    ? {
        itemDefinition: {
          marketHashName: item.marketHashName,
          weapon: item.weapon,
          rarity: item.rarity,
          iconUrl: item.iconUrl,
        },
      }
    : null;

  return (
    <div className="page item-page" data-testid="item-page">
      {loading ? <LoadingState message="Загрузка предмета…" /> : null}
      <ErrorAlert error={error} />

      {item && displayItem ? (
        <>
          <LotBreadcrumbs
            marketHashName={item.marketHashName}
            weapon={item.weapon}
            categoryLabel={getRarityDisplayLabel(item.rarity)}
          />

          <div className="lot-page-grid">
            <div className="lot-page-main">
              <div className="card lot-preview-card">
                <LotItemHero item={displayItem} />
              </div>

              <section className="card item-offers-card" data-testid="item-offers-section">
                <div className="item-offers-header">
                  <h2>Предложения продавцов</h2>
                  <span className="muted small">
                    {hasOffers ? `${item.activeLotCount} на маркетплейсе` : 'Сейчас нет активных лотов'}
                  </span>
                </div>

                {lotsLoading ? <LoadingState message="Загрузка предложений…" /> : null}

                {!lotsLoading && lots.length === 0 ? (
                  <p className="muted" data-testid="item-no-offers">
                    Пока никто не продаёт этот предмет. Оставьте заявку — мы сохраним её и покажем продавцам.
                  </p>
                ) : null}

                {!lotsLoading && lots.length > 0 ? (
                  <ul className="item-offers-list" data-testid="item-offers-list">
                    {lots.map((lot) => (
                      <li key={lot.id} className="item-offers-row" data-testid={`item-offer-${lot.id}`}>
                        <div className="item-offers-price">
                          <MoneyDisplay minor={lot.priceMinor} strong />
                        </div>
                        <div className="item-offers-actions">
                          <Link to={`/lots/${lot.id}`} className="button secondary">
                            Подробнее
                          </Link>
                          <Link
                            to={token ? `/lots/${lot.id}/checkout` : `/login?returnUrl=${encodeURIComponent(`/lots/${lot.id}/checkout`)}`}
                            className="button primary"
                          >
                            Купить
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>

            <aside className="lot-page-sidebar">
              <div className="card lot-purchase-card item-purchase-card">
                <p className="item-purchase-label muted small">Цена на маркетплейсе</p>
                <div data-testid="item-market-price">
                  <InventoryPriceStack
                    steamPriceMinor={item.steamPriceMinor}
                    marketplacePriceMinor={item.minMarketplacePriceMinor}
                    testIdPrefix="item"
                  />
                </div>

                {hasOffers && item.featuredLotId ? (
                  <Link
                    to={token ? `/lots/${item.featuredLotId}/checkout` : `/login?returnUrl=${encodeURIComponent(`/lots/${item.featuredLotId}/checkout`)}`}
                    className="button primary lot-purchase-button"
                    data-testid="item-buy-cheapest"
                  >
                    {token ? 'Купить самое дешёвое предложение' : 'Войти для покупки'}
                  </Link>
                ) : null}

                {!hasOffers ? (
                  <div className="item-buy-request-panel" data-testid="item-buy-request-panel">
                    <h3>Заявка на покупку</h3>
                    <p className="muted small">
                      Мы уведомим вас в приложении, когда появится подходящий лот. Покупка не
                      гарантирована — действуйте быстро, предложение может забрать другой.
                    </p>

                    {openBuyRequest ? (
                      <div className="item-buy-request-active" data-testid="item-buy-request-active">
                        <p>
                          Заявка активна
                          {openBuyRequest.maxPriceMinor ? (
                            <>
                              {' '}
                              до{' '}
                              <MoneyDisplay minor={openBuyRequest.maxPriceMinor} strong />
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
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
