import { Link } from 'react-router-dom';
import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { useLotPurchase } from '../hooks/useLotPurchase';
import { formatUsdFromMinor } from '../utils/format';
import { isCredibleSteamGuidePrice } from '../utils/steam-guide-price';
import { formatCounterpartyDisplayName } from '../utils/steam-profile';
import type { ItemMarketKind } from '../utils/item-market-taxonomy';
import { ErrorAlert } from './ErrorAlert';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';
import { PurchaseReadinessAlerts } from './PurchaseReadinessAlerts';
import { ExtensionAwarePurchaseTrust } from './ExtensionAwarePurchaseTrust';

type ItemMarketPurchaseCardProps = {
  lot: Lot | null;
  token: string | null;
  user: AuthUser | null;
  requiresSteamLink: boolean;
  returnPath: string;
  marketKind: ItemMarketKind;
  steamPriceMinor?: number | null;
  steamPriceLoading?: boolean;
  steamPriceFetchedAt?: string | null;
  steamPriceAgeLabel?: string | null;
  steamPriceStale?: boolean;
  steamMarketUrl: string;
  /** Optional deep-link to the selected listing dossier. */
  lotDetailsPath?: string | null;
  purchaseError?: unknown;
};

/**
 * Item-page purchase surface: buy the selected (or cheapest fungible) lot in place.
 */
export function ItemMarketPurchaseCard({
  lot,
  token,
  user,
  requiresSteamLink,
  returnPath,
  marketKind,
  steamPriceMinor = null,
  steamPriceLoading = false,
  steamPriceAgeLabel = null,
  steamPriceStale = false,
  steamMarketUrl,
  lotDetailsPath = null,
  purchaseError,
}: ItemMarketPurchaseCardProps) {
  const { t } = useLocale();
  const purchase = useLotPurchase({
    lot,
    token,
    user,
    requiresSteamLink,
    returnPath,
    purchaseError,
  });

  const listingPriceMinor = purchase.listingPriceMinor ?? lot?.priceMinor ?? null;
  const steamForGuide =
    listingPriceMinor != null &&
    isCredibleSteamGuidePrice(steamPriceMinor ?? lot?.steamPriceMinor, listingPriceMinor)
      ? (steamPriceMinor ?? lot?.steamPriceMinor ?? null)
      : null;
  const sellerName = lot?.seller ? formatCounterpartyDisplayName(lot.seller) : null;
  const isFungible = marketKind === 'fungible';

  return (
    <div
      className="card lot-purchase-card item-purchase-card"
      data-testid="item-market-purchase-card"
      data-market-kind={marketKind}
    >
      <p className="item-purchase-label muted small">
        {isFungible ? t('item.bestOffer') : t('item.selectedOffer')}
      </p>

      <div data-testid="item-market-price">
        <InventoryPriceStack
          steamPriceMinor={steamForGuide}
          marketplacePriceMinor={listingPriceMinor}
          testIdPrefix="item"
          loading={steamPriceLoading && listingPriceMinor == null}
        />
        {steamForGuide != null && steamPriceAgeLabel ? (
          <p
            className={`muted small item-steam-price-age${
              steamPriceStale ? ' item-steam-price-age-stale' : ''
            }`}
            data-testid="item-steam-price-age"
          >
            {t('item.steamUpdated', { age: steamPriceAgeLabel })}
            {steamPriceStale ? ` · ${t('item.priceMaybeStale')}` : ''}
          </p>
        ) : null}
      </div>

      {!isFungible && sellerName ? (
        <p className="lot-purchase-seller" data-testid="item-purchase-seller">
          <span className="lot-purchase-seller-label">{t('lot.sellerLabel')}</span>
          <span className="lot-purchase-seller-sep" aria-hidden="true">
            ·
          </span>
          <span className="lot-purchase-seller-name" title={sellerName}>
            {sellerName}
          </span>
        </p>
      ) : null}

      {token && purchase.summary ? (
        <div className="lot-purchase-wallet-inline" data-testid="item-checkout-wallet">
          <div className="lot-purchase-wallet-row">
            <span>{t('checkout.available')}</span>
            <MoneyDisplay minor={purchase.summary.availableMinor} strong />
          </div>
          {purchase.insufficient && purchase.shortfallMinor > 0 ? (
            <div className="lot-purchase-wallet-row lot-purchase-wallet-shortfall">
              <span>{t('checkout.shortfall')}</span>
              <MoneyDisplay minor={purchase.shortfallMinor} strong />
            </div>
          ) : null}
        </div>
      ) : null}

      <ErrorAlert error={purchase.displayError} />

      {purchase.showReadiness ? (
        <PurchaseReadinessAlerts
          user={user}
          requiresSteamLink={requiresSteamLink}
          authenticated
          insufficientBalance={purchase.insufficient}
          neededMinor={purchase.priceMinor}
          walletDepositHref={purchase.depositHref}
          showDepositAction={false}
          showTradeHint={false}
          compactTradeUrlWarning
        />
      ) : null}

      {purchase.isUnavailable ? (
        <p className="muted" data-testid="item-lot-unavailable-message">
          {t('lot.unavailable', { status: lot?.status ?? '' })}
        </p>
      ) : null}

      {purchase.isOwnLot ? (
        <p className="muted" data-testid="item-own-lot-message">
          {t('lot.ownLot')}
        </p>
      ) : null}

      {!lot ? (
        <p className="muted" data-testid="item-no-offer-selected">
          {t('item.noActiveOffers')}
        </p>
      ) : null}

      {lot && !purchase.isOwnLot && !purchase.isUnavailable ? (
        <div className="lot-purchase-sticky-dock" data-testid="item-mobile-purchase-dock">
          <div className="lot-purchase-sticky-price">
            <MoneyDisplay minor={listingPriceMinor ?? lot.priceMinor} strong />
          </div>
          <div className="lot-purchase-actions">
            {purchase.insufficient ? (
              <Link
                to={purchase.depositHref}
                className="button primary lot-purchase-button"
                data-testid="item-checkout-deposit-link"
              >
                {t('checkout.depositButton')}
                {purchase.shortfallMinor > 0
                  ? ` · ${formatUsdFromMinor(purchase.shortfallMinor)}`
                  : ''}
              </Link>
            ) : (
              <button
                type="button"
                className="button primary lot-purchase-button"
                disabled={Boolean(token) ? !purchase.canBuy : false}
                data-testid="item-buy-best"
                onClick={() => void purchase.buy()}
              >
                {!token
                  ? t('lot.loginToBuy')
                  : purchase.confirming
                    ? t('checkout.confirming')
                    : t('lot.buyNow')}
              </button>
            )}
          </div>
        </div>
      ) : lot ? (
        <div className="lot-purchase-actions">
          <button
            type="button"
            className="button primary lot-purchase-button"
            disabled
            data-testid="item-buy-best"
          >
            {!token ? t('lot.loginToBuy') : t('lot.buyNow')}
          </button>
        </div>
      ) : null}

      <a
        className="button secondary lot-purchase-button"
        href={steamMarketUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="item-steam-market-link"
      >
        Steam Market
      </a>

      {!isFungible && lotDetailsPath ? (
        <Link
          to={lotDetailsPath}
          className="text-link muted small"
          data-testid="item-lot-details-link"
        >
          {t('item.lotDetailsLink')}
        </Link>
      ) : null}

      <p className="muted small">
        {isFungible ? t('item.fungibleOfferHint') : t('item.selectOfferHint')}
      </p>

      <ExtensionAwarePurchaseTrust
        token={token}
        testId="item-purchase-trust"
      />
    </div>
  );
}
