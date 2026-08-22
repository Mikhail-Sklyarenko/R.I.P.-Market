import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  cancelBuyRequest,
  createBuyRequest,
  getAuthConfig,
  getCatalogItem,
  getItemOrderBook,
  getLot,
  listLots,
  listMyBuyRequests,
  listSimilarLots,
} from '../api/marketplace';
import type { BuyRequest, CatalogItem, ItemOrderBook as ItemOrderBookData, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
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
import { ItemWearFilterChips } from '../components/ItemWearFilterChips';
import { LoadingState } from '../components/LoadingState';
import { LotActionButtons } from '../components/LotActionButtons';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotItemHero } from '../components/LotItemHero';
import { LotListingDetail } from '../components/LotListingDetail';
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
import { getSteamItemImageUrl } from '../utils/item-image';
import { preloadWearIcons } from '../utils/wear-icons';
import { resolveItemPageMode } from '../utils/item-page-mode';

export function ItemPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { locale, t } = useLocale();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [featuredLot, setFeaturedLot] = useState<Lot | null>(null);
  const [similarLots, setSimilarLots] = useState<Lot[]>([]);
  const [buyRequests, setBuyRequests] = useState<BuyRequest[]>([]);
  const [orderBook, setOrderBook] = useState<ItemOrderBookData | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [featuredLotLoading, setFeaturedLotLoading] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lotError, setLotError] = useState<unknown>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [requiresSteamLink, setRequiresSteamLink] = useState(false);
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [selectedWear, setSelectedWear] = useState('');

  const pageMode = item ? resolveItemPageMode(item.activeLotCount) : null;
  const isBuyRequestPage = pageMode === 'buy-request';
  const isSingleListingPage = pageMode === 'single-listing';
  const isComparisonPage = pageMode === 'comparison';

  const maxPriceMinor = useMemo(() => parseUsdToMinor(maxPriceInput), [maxPriceInput]);
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
  const wearOptions = item?.availableWears ?? [];
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
    enabled: Boolean(item) && !isSingleListingPage,
  });

  usePageMeta({
    title: item?.marketHashName ?? null,
    canonicalPath: item ? `/catalog/items/${getCatalogItemRef(item)}` : null,
  });

  useEffect(() => {
    if (!isSingleListingPage) {
      return;
    }
    getAuthConfig()
      .then((config) => setRequiresSteamLink(config.inventoryProvider === 'steam'))
      .catch(() => undefined);
  }, [isSingleListingPage]);

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
    if (!item?.id || !pageMode || pageMode === 'buy-request') {
      setLots([]);
      setLotsLoading(false);
      return;
    }

    if (pageMode === 'single-listing' && item.featuredLotId) {
      setLots([]);
      setLotsLoading(false);
      return;
    }

    setLotsLoading(true);
    listLots({
      itemDefinitionId: item.id,
      wear: pageMode === 'comparison' ? selectedWear || undefined : undefined,
      sort: 'price_asc',
      limit: pageMode === 'single-listing' ? 1 : 24,
      page: 1,
    })
      .then((page) => setLots(page.items))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [item?.id, item?.featuredLotId, pageMode, selectedWear]);

  useEffect(() => {
    if (!isSingleListingPage || !item) {
      setFeaturedLot(null);
      setLotError(null);
      setFeaturedLotLoading(false);
      return;
    }

    const lotId = item.featuredLotId ?? lots[0]?.id;
    if (!lotId) {
      return;
    }

    setFeaturedLotLoading(true);
    setLotError(null);
    void getLot(lotId)
      .then(setFeaturedLot)
      .catch((err: unknown) => {
        setFeaturedLot(null);
        setLotError(err);
      })
      .finally(() => setFeaturedLotLoading(false));
  }, [isSingleListingPage, item, item?.featuredLotId, lots]);

  useEffect(() => {
    if (!isSingleListingPage || !featuredLot?.id) {
      setSimilarLots([]);
      setSimilarLoading(false);
      return;
    }

    setSimilarLoading(true);
    void listSimilarLots(featuredLot.id, 6)
      .then(setSimilarLots)
      .catch(() => setSimilarLots([]))
      .finally(() => setSimilarLoading(false));
  }, [isSingleListingPage, featuredLot?.id]);

  useEffect(() => {
    if (!item || isSingleListingPage) {
      setOrderBook(null);
      setOrderBookLoading(false);
      return;
    }
    const itemRef = getCatalogItemRef(item);
    setOrderBookLoading(true);
    getItemOrderBook(itemRef, wearForOrderBook)
      .then(setOrderBook)
      .catch(() => setOrderBook(null))
      .finally(() => setOrderBookLoading(false));
  }, [item, wearForOrderBook, isSingleListingPage]);

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

                  <ItemOrderBook
                    orderBook={orderBook}
                    loading={orderBookLoading}
                    showSellHint
                    hideEmptyAsks
                    variant="compact"
                    ownBuyRequests={openBuyRequests}
                  />
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

              <DealFlowSteps
                title={t('item.howRequestWorks')}
                steps={BUY_REQUEST_FLOW_STEP_ITEMS}
              />
            </>
          ) : null}

          {isSingleListingPage ? (
            <>
              {featuredLotLoading || lotsLoading ? (
                <LoadingState message={t('lot.loading')} />
              ) : null}
              {featuredLot ? (
                <LotListingDetail
                  lot={featuredLot}
                  token={token}
                  user={user}
                  requiresSteamLink={requiresSteamLink}
                  purchaseError={lotError}
                  siblingOfferCount={item.activeLotCount}
                  catalogItemPath={`/catalog/items/${getCatalogItemRef(item)}`}
                  returnPath={`/catalog/items/${getCatalogItemRef(item)}`}
                  similarLots={similarLots}
                  similarLoading={similarLoading}
                  previewTestId="lot-preview-card"
                  specTestId="lot-spec"
                  stickersTestIdPrefix="lot"
                  layoutTestId="item-single-listing-layout"
                />
              ) : null}
              {!featuredLotLoading && !lotsLoading && !featuredLot ? (
                <ErrorAlert error={lotError ?? new Error(t('item.noActiveOffers'))} />
              ) : null}
            </>
          ) : null}

          {isComparisonPage ? (
            <div className="item-compare-layout" data-testid="item-comparison-layout">
              <div className="item-compare-main">
                <ItemCompareHeader
                  item={item}
                  iconUrl={displayItem?.itemDefinition.iconUrl ?? item.iconUrl}
                />
                <ItemWearFilterChips
                  value={selectedWear}
                  availableWears={wearOptions}
                  onChange={setSelectedWear}
                />
                <ItemOrderBook
                  orderBook={orderBook}
                  loading={orderBookLoading}
                  hideEmptyBids
                />
                <ItemOffersTable lots={lots} loading={lotsLoading} />
              </div>

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
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
