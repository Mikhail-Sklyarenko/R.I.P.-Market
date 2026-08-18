import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  cancelBuyRequest,
  createBuyRequest,
  getCatalogItem,
  getItemOrderBook,
  listLots,
  listMyBuyRequests,
} from '../api/marketplace';
import type { BuyRequest, CatalogItem, ItemOrderBook as ItemOrderBookData, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale, wearLabel } from '../i18n';
import { useWearSteamPrice } from '../hooks/useWearSteamPrice';
import { usePageMeta } from '../hooks/usePageMeta';
import { DealFlowSteps } from '../components/DealFlowSteps';
import { BUY_REQUEST_FLOW_STEP_ITEMS } from '../utils/order-flow';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryPriceStack } from '../components/InventoryPriceStack';
import { ItemBuyRequestPanel } from '../components/ItemBuyRequestPanel';
import { ItemCompareHeader } from '../components/ItemCompareHeader';
import { ItemOffersTable } from '../components/ItemOffersTable';
import { ItemOrderBook } from '../components/ItemOrderBook';
import { ItemParamsPanel } from '../components/ItemParamsPanel';
import { LoadingState } from '../components/LoadingState';
import { LotActionButtons } from '../components/LotActionButtons';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotItemHero } from '../components/LotItemHero';
import { getCatalogItemRef, isUuid } from '../utils/item-slug';
import {
  formatSteamPriceAge,
  isSteamPriceStale,
} from '../utils/steam-price-age';
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
  const [searchParams] = useSearchParams();
  const { locale, t } = useLocale();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [buyRequests, setBuyRequests] = useState<BuyRequest[]>([]);
  const [orderBook, setOrderBook] = useState<ItemOrderBookData | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [selectedWear, setSelectedWear] = useState('');

  const maxPriceMinor = useMemo(() => parseUsdToMinor(maxPriceInput), [maxPriceInput]);
  const hasOffers = (item?.activeLotCount ?? 0) > 0;
  const isComparisonPage = hasOffers && (item?.activeLotCount ?? 0) > 1;
  const isBuyRequestPage = Boolean(item) && !hasOffers;
  const openBuyRequests = useMemo(() => {
    return buyRequests.filter((request) => {
      if (request.status !== 'OPEN') {
        return false;
      }
      if (!selectedWear) {
        return true;
      }
      const wearInName = parseWearCodeFromMarketHashName(
        request.itemDefinition?.marketHashName ?? '',
      );
      return !wearInName || wearInName === selectedWear;
    });
  }, [buyRequests, selectedWear]);
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
  const wearForOrderBook = isBuyRequestPage
    ? selectedWear || effectiveWear || undefined
    : selectedWear || undefined;
  const {
    steamPriceMinor: wearSteamPrice,
    steamPriceFetchedAt: wearSteamPriceFetchedAt,
    loading: wearSteamPriceLoading,
  } = useWearSteamPrice(item?.marketHashName, wearForSteamPrice, item?.steamPriceMinor, {
    enabled: Boolean(item),
  });

  usePageMeta({
    title: item?.marketHashName ?? null,
    canonicalPath: item ? `/catalog/items/${getCatalogItemRef(item)}` : null,
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
    if (!item?.slug || !id) {
      return;
    }
    if (isUuid(id) && id !== item.slug) {
      const query = searchParams.toString();
      navigate(`/catalog/items/${item.slug}${query ? `?${query}` : ''}`, { replace: true });
    }
  }, [item, id, navigate, searchParams]);

  useEffect(() => {
    if (!item?.id) {
      return;
    }
    setLotsLoading(true);
    listLots({
      itemDefinitionId: item.id,
      wear: selectedWear || undefined,
      sort: 'price_asc',
      limit: 24,
      page: 1,
    })
      .then((page) => setLots(page.items))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [item?.id, selectedWear]);

  useEffect(() => {
    if (!item) {
      setOrderBook(null);
      return;
    }
    const itemRef = getCatalogItemRef(item);
    setOrderBookLoading(true);
    getItemOrderBook(itemRef, wearForOrderBook)
      .then(setOrderBook)
      .catch(() => setOrderBook(null))
      .finally(() => setOrderBookLoading(false));
  }, [item, wearForOrderBook]);

  useEffect(() => {
    if (!item?.wearIcons) {
      return;
    }
    preloadWearIcons(item.wearIcons, getSteamItemImageUrl);
  }, [item?.id, item?.wearIcons]);

  useEffect(() => {
    if (!token || !item?.id) {
      setBuyRequests([]);
      return;
    }
    listMyBuyRequests(token, item.id)
      .then(setBuyRequests)
      .catch(() => setBuyRequests([]));
  }, [token, item?.id]);

  async function refreshOrderBook() {
    if (!item) {
      return;
    }
    try {
      const next = await getItemOrderBook(getCatalogItemRef(item), wearForOrderBook);
      setOrderBook(next);
    } catch {
      setOrderBook(null);
    }
  }

  async function handleCreateBuyRequest() {
    if (!item?.id) {
      return;
    }
    if (!token) {
      try {
        await startSteamLogin(`/catalog/items/${getCatalogItemRef(item)}`);
      } catch {
        // Stay on item page; user can retry via header Steam CTA.
      }
      return;
    }
    if (wearOptions.length > 0 && !selectedWear) {
      setRequestError(new Error(t('item.selectWear')));
      return;
    }
    if (!maxPriceMinor) {
      setRequestError(new Error(t('item.invalidMaxPrice')));
      return;
    }
    const quantity = Number.parseInt(quantityInput, 10);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      setRequestError(new Error(t('buyRequestPanel.invalidQuantity')));
      return;
    }

    setSubmitting(true);
    setRequestError(null);
    try {
      const created = await createBuyRequest(token, item.id, {
        maxPriceMinor,
        quantity,
        wear: selectedWear || undefined,
      });
      setBuyRequests((current) => [created, ...current]);
      setMaxPriceInput('');
      setQuantityInput('1');
      void refreshOrderBook();
    } catch (err: unknown) {
      setRequestError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelBuyRequest(requestId: string) {
    if (!token) {
      return;
    }
    setCancelingId(requestId);
    setRequestError(null);
    try {
      const updated = await cancelBuyRequest(token, requestId);
      setBuyRequests((current) =>
        current.map((request) => (request.id === requestId ? updated : request)),
      );
      void refreshOrderBook();
    } catch (err: unknown) {
      setRequestError(err);
    } finally {
      setCancelingId(null);
    }
  }

  if (!id) {
    return null;
  }

  return (
    <div className="page item-page" data-testid="item-page">
      {loading ? <LoadingState message={t('item.loading')} /> : null}
      <ErrorAlert error={error} />

      {item && displayItem ? (
        <>
          <LotBreadcrumbs
            marketHashName={item.marketHashName}
            weapon={item.weapon}
            categoryLabel={getRarityDisplayLabel(item.rarity, locale)}
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
                    openBuyRequests={openBuyRequests}
                    selectedWear={selectedWear}
                    onWearChange={setSelectedWear}
                    steamPriceMinor={wearSteamPrice}
                    steamPriceLoading={wearSteamPriceLoading}
                    maxPriceInput={maxPriceInput}
                    quantityInput={quantityInput}
                    submitting={submitting}
                    cancelingId={cancelingId}
                    requestError={requestError}
                    onMaxPriceChange={setMaxPriceInput}
                    onQuantityChange={setQuantityInput}
                    onSubmit={handleCreateBuyRequest}
                    onCancel={handleCancelBuyRequest}
                  />
                </aside>
              </div>

              <ItemOrderBook
                orderBook={orderBook}
                loading={orderBookLoading}
                showSellHint
              />

              <DealFlowSteps
                title={t('item.howRequestWorks')}
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
                      {t('catalog.all')}
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
                        {wearLabel(option.value, locale)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <ItemOrderBook orderBook={orderBook} loading={orderBookLoading} />
                {isComparisonPage || lots.length > 0 ? (
                  <ItemOffersTable lots={lots} loading={lotsLoading} />
                ) : null}
              </div>

              {isComparisonPage || cheapestLot ? (
                <aside className="item-compare-sidebar">
                  <div className="card lot-purchase-card item-purchase-card">
                    <p className="item-purchase-label muted small">{t('item.bestOffer')}</p>
                    <div data-testid="item-market-price">
                      <InventoryPriceStack
                        steamPriceMinor={wearSteamPrice}
                        marketplacePriceMinor={
                          cheapestLot?.priceMinor ?? item.minMarketplacePriceMinor
                        }
                        testIdPrefix="item"
                        loading={wearSteamPriceLoading}
                      />
                      {wearSteamPrice != null && wearSteamPriceFetchedAt ? (
                        <p
                          className={`muted small item-steam-price-age${
                            isSteamPriceStale(wearSteamPriceFetchedAt)
                              ? ' item-steam-price-age-stale'
                              : ''
                          }`}
                          data-testid="item-steam-price-age"
                        >
                          {t('item.steamUpdated', {
                            age: formatSteamPriceAge(wearSteamPriceFetchedAt, locale) ?? '',
                          })}
                          {isSteamPriceStale(wearSteamPriceFetchedAt)
                            ? ` · ${t('item.priceMaybeStale')}`
                            : ''}
                        </p>
                      ) : null}
                    </div>

                    {cheapestLot ? (
                      <Link
                        to={`/lots/${cheapestLot.id}`}
                        className="button primary lot-purchase-button"
                        data-testid="item-open-cheapest"
                      >
                        {t('item.openBestOffer')}
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
                      {t('item.floatStickersHint')}
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
