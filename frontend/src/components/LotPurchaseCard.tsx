import { Link } from 'react-router-dom';
import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { isCredibleSteamGuidePrice } from '../utils/steam-guide-price';
import { formatCounterpartyDisplayName } from '../utils/steam-profile';
import { DealFlowSteps } from './DealFlowSteps';
import { ErrorAlert } from './ErrorAlert';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';
import { PurchaseReadinessAlerts } from './PurchaseReadinessAlerts';
import { StatusBadge } from './StatusBadge';

type LotPurchaseCardProps = {
  lot: Lot;
  token: string | null;
  user: AuthUser | null;
  canProceed: boolean;
  isOwnLot: boolean;
  isUnavailable: boolean;
  showPurchaseBlockers: boolean;
  requiresSteamLink: boolean;
  siblingOfferCount: number | null;
  catalogItemPath: string | null;
  purchaseError: unknown;
  onBuy: () => void;
};

/**
 * Sticky purchase CTA: seller trust, listing price, disclosures, buy.
 * Wear/float stay on the item card — this block is for money and who sells.
 */
export function LotPurchaseCard({
  lot,
  token,
  user,
  canProceed,
  isOwnLot,
  isUnavailable,
  showPurchaseBlockers,
  requiresSteamLink,
  siblingOfferCount,
  catalogItemPath,
  purchaseError,
  onBuy,
}: LotPurchaseCardProps) {
  const { t } = useLocale();

  const listingPriceMinor = lot.marketplacePriceMinor ?? lot.priceMinor;
  const steamForGuide = isCredibleSteamGuidePrice(lot.steamPriceMinor, listingPriceMinor)
    ? lot.steamPriceMinor
    : null;

  const sellerName = lot.seller
    ? formatCounterpartyDisplayName(lot.seller)
    : null;

  return (
    <div className="card lot-purchase-card" data-testid="lot-purchase-card">
      <div className="lot-purchase-card-header">
        {sellerName ? (
          <div className="lot-purchase-seller" data-testid="lot-purchase-seller">
            <span className="lot-purchase-seller-label">{t('lot.sellerLabel')}</span>
            <span className="lot-purchase-seller-name" title={sellerName}>
              {sellerName}
            </span>
          </div>
        ) : (
          <div className="lot-purchase-seller" aria-hidden="true" />
        )}
        <StatusBadge status={lot.status} />
      </div>

      <div className="lot-purchase-price" data-testid="lot-purchase-price">
        <InventoryPriceStack
          steamPriceMinor={steamForGuide}
          marketplacePriceMinor={listingPriceMinor}
          testIdPrefix="lot"
          compact={!steamForGuide}
        />
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

      <details className="lot-pricing-details">
        <summary className="lot-pricing-details-summary">
          {t('lot.commissionDetails')}
        </summary>
        <div className="pricing-preview lot-pricing-details-body">
          <div>
            <span>{t('lot.commission')}</span>
            <MoneyDisplay minor={lot.commissionMinor} strong />
          </div>
          <div>
            <span>{t('lot.sellerReceives')}</span>
            <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
          </div>
        </div>
      </details>

      <ErrorAlert error={purchaseError} />

      {showPurchaseBlockers ? (
        <PurchaseReadinessAlerts
          user={user}
          requiresSteamLink={requiresSteamLink}
          authenticated
          showTradeHint={false}
        />
      ) : null}

      {isUnavailable ? (
        <p className="muted" data-testid="lot-unavailable-message">
          {t('lot.unavailable', { status: lot.status })}
        </p>
      ) : null}

      {isOwnLot ? (
        <p className="muted" data-testid="own-lot-message">
          {t('lot.ownLot')}
        </p>
      ) : null}

      <DealFlowSteps compact />

      <button
        type="button"
        className="button primary lot-purchase-button"
        disabled={!canProceed}
        data-testid="buy-lot-button"
        onClick={onBuy}
      >
        {!token ? t('lot.loginToBuy') : t('lot.buyNow')}
      </button>
    </div>
  );
}
