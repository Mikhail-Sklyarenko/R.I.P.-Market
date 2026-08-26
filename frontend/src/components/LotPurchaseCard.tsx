import { Link } from 'react-router-dom';
import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { useLotPurchase } from '../hooks/useLotPurchase';
import { formatUsdFromMinor } from '../utils/format';
import { isCredibleSteamGuidePrice } from '../utils/steam-guide-price';
import { formatCounterpartyDisplayName } from '../utils/steam-profile';
import { ErrorAlert } from './ErrorAlert';
import { ExtensionAwarePurchaseTrust } from './ExtensionAwarePurchaseTrust';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';
import { PurchaseReadinessAlerts } from './PurchaseReadinessAlerts';
import { StatusBadge } from './StatusBadge';

type LotPurchaseCardProps = {
  lot: Lot;
  token: string | null;
  user: AuthUser | null;
  requiresSteamLink: boolean;
  siblingOfferCount: number | null;
  catalogItemPath: string | null;
  /** Where to return after Steam login or wallet deposit. */
  returnPath: string;
  purchaseError?: unknown;
};

/**
 * Sticky purchase CTA: listing price is the hero; Buy Now creates the order here.
 */
export function LotPurchaseCard({
  lot,
  token,
  user,
  requiresSteamLink,
  siblingOfferCount,
  catalogItemPath,
  returnPath,
  purchaseError,
}: LotPurchaseCardProps) {
  const { t } = useLocale();
  const purchase = useLotPurchase({
    lot,
    token,
    user,
    requiresSteamLink,
    returnPath,
    purchaseError,
  });

  const steamForGuide = isCredibleSteamGuidePrice(lot.steamPriceMinor, purchase.listingPriceMinor)
    ? lot.steamPriceMinor
    : null;
  const sellerName = lot.seller ? formatCounterpartyDisplayName(lot.seller) : null;
  const listingPriceMinor = purchase.listingPriceMinor ?? lot.priceMinor;

  return (
    <div className="card lot-purchase-card" data-testid="lot-purchase-card">
      <div className="lot-purchase-hero" data-testid="checkout-pricing">
        <div className="lot-purchase-hero-top">
          <div className="lot-purchase-price" data-testid="lot-purchase-price">
            <InventoryPriceStack
              steamPriceMinor={steamForGuide}
              marketplacePriceMinor={listingPriceMinor}
              testIdPrefix="lot"
              compact={!steamForGuide}
            />
          </div>
          <StatusBadge status={lot.status} />
        </div>

        {sellerName ? (
          <p className="lot-purchase-seller" data-testid="lot-purchase-seller">
            <span className="lot-purchase-seller-label">{t('lot.sellerLabel')}</span>
            <span className="lot-purchase-seller-sep" aria-hidden="true">
              ·
            </span>
            <span className="lot-purchase-seller-name" title={sellerName}>
              {sellerName}
            </span>
          </p>
        ) : null}
      </div>

      {siblingOfferCount && siblingOfferCount > 1 && catalogItemPath ? (
        <Link
          to={catalogItemPath}
          className="lot-compare-offers-link muted small"
          data-testid="lot-compare-offers-link"
        >
          {t('lot.allOffers', { count: siblingOfferCount })}
        </Link>
      ) : null}

      {token && purchase.summary ? (
        <div className="lot-purchase-wallet-inline" data-testid="checkout-wallet">
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
        <p className="muted" data-testid="lot-unavailable-message">
          {t('lot.unavailable', { status: lot.status })}
        </p>
      ) : null}

      {purchase.isOwnLot ? (
        <p className="muted" data-testid="own-lot-message">
          {t('lot.ownLot')}
        </p>
      ) : null}

      {!purchase.isOwnLot && !purchase.isUnavailable ? (
        <div className="lot-purchase-sticky-dock" data-testid="lot-mobile-purchase-dock">
          <div className="lot-purchase-sticky-price">
            <MoneyDisplay minor={listingPriceMinor} strong />
          </div>
          <div className="lot-purchase-actions">
            {purchase.insufficient ? (
              <Link
                to={purchase.depositHref}
                className="button primary lot-purchase-button"
                data-testid="checkout-deposit-link"
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
                data-testid="buy-lot-button"
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
      ) : (
        <div className="lot-purchase-actions">
          <button
            type="button"
            className="button primary lot-purchase-button"
            disabled
            data-testid="buy-lot-button"
          >
            {!token ? t('lot.loginToBuy') : t('lot.buyNow')}
          </button>
        </div>
      )}

      <ExtensionAwarePurchaseTrust
        token={token}
        testId="lot-purchase-trust"
      />

      <details className="lot-purchase-details" data-testid="lot-purchase-details">
        <summary className="lot-purchase-details-summary">
          {t('lot.commissionDetails')}
        </summary>
        <div className="lot-purchase-details-body">
          <div
            className="lot-purchase-details-section"
            data-testid="lot-commission-details"
          >
            <div className="pricing-preview lot-purchase-commission-grid">
              <div>
                <span>{t('lot.commission')}</span>
                <MoneyDisplay minor={lot.commissionMinor} strong />
              </div>
              <div>
                <span>{t('lot.sellerReceives')}</span>
                <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
