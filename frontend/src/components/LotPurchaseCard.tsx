import { Link } from 'react-router-dom';
import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { formatFloatValue, type ItemDisplaySource } from '../utils/item-image';
import { parseWearCodeFromMarketHashName } from '../utils/catalog-lot-display';
import { getWearDisplayLabel } from '../utils/wear-filters';
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
  displayItem: ItemDisplaySource;
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
 * Sticky purchase CTA for an active lot: price confidence, item snapshot, seller, buy.
 */
export function LotPurchaseCard({
  lot,
  displayItem,
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
  const { locale, t } = useLocale();

  const listingPriceMinor = lot.marketplacePriceMinor ?? lot.priceMinor;
  const steamForGuide = isCredibleSteamGuidePrice(lot.steamPriceMinor, listingPriceMinor)
    ? lot.steamPriceMinor
    : null;

  const wearCode =
    displayItem.wear?.trim() ||
    parseWearCodeFromMarketHashName(displayItem.itemDefinition.marketHashName) ||
    null;
  const wearText = getWearDisplayLabel(wearCode, locale);
  const floatText = formatFloatValue(displayItem.floatValue);

  const sellerName = lot.seller
    ? formatCounterpartyDisplayName(lot.seller)
    : null;

  const snapshotBits = [wearText, floatText ? `Float ${floatText}` : null].filter(
    Boolean,
  ) as string[];

  return (
    <div className="card lot-purchase-card" data-testid="lot-purchase-card">
      <div className="lot-purchase-card-header">
        <div className="lot-purchase-snapshot" data-testid="lot-purchase-snapshot">
          {snapshotBits.length > 0 ? (
            <p className="lot-purchase-snapshot-line muted small">
              {snapshotBits.join(' · ')}
            </p>
          ) : (
            <p className="lot-purchase-snapshot-line muted small">
              {t('lot.listingReady')}
            </p>
          )}
          {sellerName ? (
            <p className="lot-purchase-seller muted small" data-testid="lot-purchase-seller">
              {t('lot.sellerLabel')}{' '}
              <span className="lot-purchase-seller-name">{sellerName}</span>
            </p>
          ) : null}
        </div>
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
