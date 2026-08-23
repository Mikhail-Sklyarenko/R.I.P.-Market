import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createOrder } from '../api/marketplace';
import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { formatUsdFromMinor } from '../utils/format';
import { isCredibleSteamGuidePrice } from '../utils/steam-guide-price';
import { formatCounterpartyDisplayName } from '../utils/steam-profile';
import { startSteamLogin } from '../utils/start-steam-login';
import { DealFlowSteps } from './DealFlowSteps';
import { ErrorAlert } from './ErrorAlert';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';
import { isPurchaseBlocked, PurchaseReadinessAlerts } from './PurchaseReadinessAlerts';
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
  const navigate = useNavigate();
  const { summary, availableMinor, loading: walletLoading } = useWalletSummary();
  const [confirming, setConfirming] = useState(false);
  const [buyError, setBuyError] = useState<unknown>(null);

  const listingPriceMinor = lot.marketplacePriceMinor ?? lot.priceMinor;
  const priceMinor = Number(lot.priceMinor);
  const steamForGuide = isCredibleSteamGuidePrice(lot.steamPriceMinor, listingPriceMinor)
    ? lot.steamPriceMinor
    : null;
  const sellerName = lot.seller ? formatCounterpartyDisplayName(lot.seller) : null;

  const isOwnLot = Boolean(user && lot.sellerId === user.id);
  const isUnavailable = lot.status !== 'ACTIVE';
  const purchaseBlocked = isPurchaseBlocked(user, requiresSteamLink, Boolean(token));
  const insufficient =
    Boolean(token) &&
    availableMinor !== null &&
    priceMinor > 0 &&
    availableMinor < priceMinor;
  const shortfallMinor =
    insufficient && availableMinor !== null ? priceMinor - availableMinor : 0;
  const depositNeededMinor = shortfallMinor > 0 ? shortfallMinor : priceMinor;
  const depositHref = `/wallet?tab=deposit&returnUrl=${encodeURIComponent(returnPath)}&needed=${depositNeededMinor}`;
  const showReadiness =
    Boolean(token) && !isOwnLot && !isUnavailable;
  const canBuy =
    Boolean(token) &&
    lot.status === 'ACTIVE' &&
    !isOwnLot &&
    !purchaseBlocked &&
    !insufficient &&
    !confirming &&
    !walletLoading;
  const displayError = buyError ?? purchaseError;

  async function handleBuy() {
    if (!token) {
      try {
        await startSteamLogin(returnPath);
      } catch {
        // Stay on listing; user can retry via header Steam CTA.
      }
      return;
    }
    if (!canBuy) {
      return;
    }

    setConfirming(true);
    setBuyError(null);
    try {
      const order = await createOrder(token, lot.id);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setBuyError(err);
    } finally {
      setConfirming(false);
    }
  }

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

      {token && summary ? (
        <div className="lot-purchase-wallet-inline" data-testid="checkout-wallet">
          <div className="lot-purchase-wallet-row">
            <span>{t('checkout.available')}</span>
            <MoneyDisplay minor={summary.availableMinor} strong />
          </div>
          {insufficient && shortfallMinor > 0 ? (
            <div className="lot-purchase-wallet-row lot-purchase-wallet-shortfall">
              <span>{t('checkout.shortfall')}</span>
              <MoneyDisplay minor={shortfallMinor} strong />
            </div>
          ) : null}
        </div>
      ) : null}

      <ErrorAlert error={displayError} />

      {showReadiness ? (
        <PurchaseReadinessAlerts
          user={user}
          requiresSteamLink={requiresSteamLink}
          authenticated
          insufficientBalance={insufficient}
          neededMinor={priceMinor}
          walletDepositHref={depositHref}
          showDepositAction={false}
          showTradeHint={false}
          compactTradeUrlWarning
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

      <div className="lot-purchase-actions">
        {insufficient && !isOwnLot && !isUnavailable ? (
          <Link
            to={depositHref}
            className="button primary lot-purchase-button"
            data-testid="checkout-deposit-link"
          >
            {t('checkout.depositButton')}
            {shortfallMinor > 0 ? ` · ${formatUsdFromMinor(shortfallMinor)}` : ''}
          </Link>
        ) : (
          <button
            type="button"
            className="button primary lot-purchase-button"
            disabled={Boolean(token) ? !canBuy : isUnavailable || isOwnLot}
            data-testid="buy-lot-button"
            onClick={() => void handleBuy()}
          >
            {!token
              ? t('lot.loginToBuy')
              : confirming
                ? t('checkout.confirming')
                : t('lot.buyNow')}
          </button>
        )}
      </div>

      <div className="lot-purchase-trust" data-testid="lot-purchase-trust">
        <DealFlowSteps embedded />
      </div>

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
