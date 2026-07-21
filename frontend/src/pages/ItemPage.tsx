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
import { useWearSteamPrice } from '../hooks/useWearSteamPrice';
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
import { CATALOG_WEAR_FILTERS } from '../utils/wear-filters';
import { getSteamItemImageUrl } from '../utils/item-image';
import { preloadWearIcons } from '../utils/wear-icons';

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
  const [selectedWear, setSelectedWear] = useState('');

  const maxPriceMinor = useMemo(() => parseUsdToMinor(maxPriceInput), [maxPriceInput]);
  const hasOffers = (item?.activeLotCount ?? 0) > 0;
  const isComparisonPage = hasOffers && (item?.activeLotCount ?? 0) > 1;
  const isBuyRequestPage = Boolean(item) && !hasOffers;
  const openBuyRequest = buyRequest?.status === 'OPEN' ? buyRequest : null;
  const cheapestLot = lots[0] ?? null;
  const wearOptions = useMemo(() => {
    if (!item?.availableWears?.length) {
      return [];
    }
    return CATALOG_WEAR_FILTERS.filter((option) =>
      item.availableWears!.includes(option.value),
    );
  }, [item]);
  const effectiveWear =
    selectedWear ||
    parseWearCodeFromMarketHashName(item?.marketHashName ?? '') ||
    '';
  const displayItem = useMemo(
    () => (item ? toCatalogItemDisplaySource(item, effectiveWear) : null),
    [item, effectiveWear],
  );
  const wearForSteamPrice = isBuyRequestPage ? selectedWear || effectiveWear : selectedWear;
  const { steamPriceMinor: wearSteamPrice, loading: wearSteamPriceLoading } =
    useWearSteamPrice(item?.marketHashName, wearForSteamPrice, item?.steamPriceMinor, {
      enabled: Boolean(item),
      forceRefresh: Boolean(wearForSteamPrice),
    });

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError(null);
    getCatalogItem(id)
      .then((next) => {
        setItem(next);
        const wears = next.availableWears ?? [];
        setSelectedWear((prev) => {
          if (prev && wears.includes(prev)) {
            return prev;
          }
          // Offers page: show all wears by default. Buy-request page: pick first wear.
          if ((next.activeLotCount ?? 0) > 0) {
            return '';
          }
          return wears[0] ?? '';
        });
      })
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLotsLoading(true);
    listLots({
      itemDefinitionId: id,
      wear: selectedWear || undefined,
      sort: 'price_asc',
      limit: 24,
      page: 1,
    })
      .then((page) => setLots(page.items))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [id, selectedWear]);

  useEffect(() => {
    if (!item?.wearIcons) {
      return;
    }
    preloadWearIcons(item.wearIcons, getSteamItemImageUrl);
  }, [item?.id, item?.wearIcons]);

  useEffect(() => {
    if (!token || !id) {
      setBuyRequest(null);
      return;
    }
    listMyBuyRequests(token, id)
      .then((requests) => {
        const open = requests.find((request) => request.status === 'OPEN');
        if (open && selectedWear) {
          const wearInName = parseWearCodeFromMarketHashName(
            open.itemDefinition?.marketHashName ?? '',
          );
          if (wearInName && wearInName !== selectedWear) {
            const matching = requests.find(
              (request) =>
                request.status === 'OPEN' &&
                parseWearCodeFromMarketHashName(
                  request.itemDefinition?.marketHashName ?? '',
                ) === selectedWear,
            );
            setBuyRequest(matching ?? open);
            return;
          }
        }
        setBuyRequest(open ?? requests[0] ?? null);
      })
      .catch(() => setBuyRequest(null));
  }, [token, id, selectedWear]);

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
    if (wearOptions.length > 0 && !selectedWear) {
      setRequestError(new Error('Выберите состояние скина.'));
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
        wear: selectedWear || undefined,
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
                          effectiveWear || null,
                        )}
                        steamMarketHashName={resolveSteamMarketHashName(
                          item.marketHashName,
                          effectiveWear || null,
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
                    selectedWear={selectedWear}
                    onWearChange={setSelectedWear}
                    steamPriceMinor={wearSteamPrice}
                    steamPriceLoading={wearSteamPriceLoading}
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
                <ItemCompareHeader
                  item={item}
                  iconUrl={displayItem?.itemDefinition.iconUrl ?? item.iconUrl}
                />
                {wearOptions.length > 0 ? (
                  <div
                    className="item-page-wear-filters"
                    data-testid="item-page-wear-filters"
                  >
                    <button
                      type="button"
                      className={`catalog-rarity-filter${selectedWear === '' ? ' active' : ''}`}
                      data-testid="item-wear-all"
                      onClick={() => setSelectedWear('')}
                    >
                      Все состояния
                    </button>
                    {wearOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`catalog-rarity-filter${
                          selectedWear === option.value ? ' active' : ''
                        }`}
                        style={{ color: option.color }}
                        data-testid={`item-wear-${option.value.toLowerCase()}`}
                        onClick={() => setSelectedWear(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {isComparisonPage || lots.length > 0 ? (
                  <ItemOffersTable lots={lots} loading={lotsLoading} />
                ) : null}
              </div>

              {isComparisonPage || cheapestLot ? (
                <aside className="item-compare-sidebar">
                  <div className="card lot-purchase-card item-purchase-card">
                    <p className="item-purchase-label muted small">Лучшее предложение</p>
                    <div data-testid="item-market-price">
                      <InventoryPriceStack
                        steamPriceMinor={wearSteamPrice}
                        marketplacePriceMinor={
                          cheapestLot?.priceMinor ?? item.minMarketplacePriceMinor
                        }
                        testIdPrefix="item"
                        loading={wearSteamPriceLoading}
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

                    <a
                      className="button secondary lot-purchase-button"
                      href={buildSteamMarketListingUrl(
                        item.marketHashName,
                        effectiveWear || null,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="item-steam-market-link"
                    >
                      Steam Market
                    </a>

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
