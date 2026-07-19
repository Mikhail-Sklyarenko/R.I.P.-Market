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
import { DealFlowSteps } from '../components/DealFlowSteps';
import { BUY_REQUEST_FLOW_STEP_ITEMS } from '../utils/order-flow';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryPriceStack } from '../components/InventoryPriceStack';
import { ItemBuyRequestPanel } from '../components/ItemBuyRequestPanel';
import { ItemCompareHeader } from '../components/ItemCompareHeader';
import { ItemOffersTable } from '../components/ItemOffersTable';
import { ItemParamsPanel } from '../components/ItemParamsPanel';
import { LoadingState } from '../components/LoadingState';
import { LotActionButtons } from '../components/LotActionButtons';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotItemHero } from '../components/LotItemHero';
import {
  resolveSingleLotId,
  shouldRedirectItemPageToLot,
} from '../utils/catalog-navigation';
import { getRarityDisplayLabel } from '../utils/rarity-colors';
import { parseUsdToMinor } from '../utils/format';
import { startSteamLogin } from '../utils/start-steam-login';
import {
  buildSteamMarketListingUrl,
  parseWearCodeFromMarketHashName,
  resolveSteamMarketHashName,
  toCatalogItemDisplaySource,
} from '../utils/steam-market-link';

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
  const isBuyRequestPage = Boolean(item) && !hasOffers;
  const openBuyRequest = buyRequest?.status === 'OPEN' ? buyRequest : null;
  const cheapestLot = lots[0] ?? null;
  const displayItem = useMemo(
    () => (item ? toCatalogItemDisplaySource(item) : null),
    [item],
  );

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
    if (!id) {
      return;
    }
    if (!token) {
      try {
        await startSteamLogin(`/catalog/items/${id}`);
      } catch {
        // Stay on item page; user can retry via header Steam CTA.
      }
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

      {item && displayItem ? (
        <>
          <LotBreadcrumbs
            marketHashName={item.marketHashName}
            weapon={item.weapon}
            categoryLabel={getRarityDisplayLabel(item.rarity)}
          />

          {isBuyRequestPage ? (
            <>
              <div className="lot-page-grid" data-testid="item-buy-request-layout">
                <div className="lot-page-main">
                  <div className="card lot-preview-card" data-testid="item-preview-card">
                    <LotItemHero item={displayItem} />
                    <div className="lot-preview-card-body">
                      <ItemParamsPanel item={displayItem} testId="item-params" />
                      <LotActionButtons
                        steamMarketUrl={buildSteamMarketListingUrl(
                          item.marketHashName,
                          parseWearCodeFromMarketHashName(item.marketHashName),
                        )}
                        steamMarketHashName={resolveSteamMarketHashName(
                          item.marketHashName,
                          parseWearCodeFromMarketHashName(item.marketHashName),
                        )}
                      />
                    </div>
                  </div>
                </div>

                <aside className="lot-page-sidebar">
                  <ItemBuyRequestPanel
                    item={item}
                    token={token}
                    openBuyRequest={openBuyRequest}
                    maxPriceInput={maxPriceInput}
                    submitting={submitting}
                    requestError={requestError}
                    onMaxPriceChange={setMaxPriceInput}
                    onSubmit={handleCreateBuyRequest}
                    onCancel={handleCancelBuyRequest}
                  />
                </aside>
              </div>

              <DealFlowSteps
                title="Как работает заявка"
                steps={BUY_REQUEST_FLOW_STEP_ITEMS}
              />
            </>
          ) : (
            <div
              className={`item-compare-layout${isComparisonPage ? '' : ' item-compare-layout-single'}`}
            >
              <div className="item-compare-main">
                <ItemCompareHeader item={item} />
                {isComparisonPage ? (
                  <ItemOffersTable lots={lots} loading={lotsLoading} />
                ) : null}
              </div>

              {isComparisonPage ? (
                <aside className="item-compare-sidebar">
                  <div className="card lot-purchase-card item-purchase-card">
                    <p className="item-purchase-label muted small">Лучшее предложение</p>
                    <div data-testid="item-market-price">
                      <InventoryPriceStack
                        steamPriceMinor={item.steamPriceMinor}
                        marketplacePriceMinor={
                          cheapestLot?.priceMinor ?? item.minMarketplacePriceMinor
                        }
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
          )}
        </>
      ) : null}
    </div>
  );
}
