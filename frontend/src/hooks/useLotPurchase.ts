import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrder } from '../api/marketplace';
import type { AuthUser, Lot } from '../api/types';
import { useWalletSummary } from './useWalletSummary';
import { isPurchaseBlocked } from '../components/PurchaseReadinessAlerts';
import { startSteamLogin } from '../utils/start-steam-login';

type UseLotPurchaseArgs = {
  lot: Lot | null;
  token: string | null;
  user: AuthUser | null;
  requiresSteamLink: boolean;
  returnPath: string;
  purchaseError?: unknown;
};

/**
 * Shared buy-now state for lot page and item-page market purchase.
 * Always creates an order for a concrete ACTIVE lotId.
 */
export function useLotPurchase({
  lot,
  token,
  user,
  requiresSteamLink,
  returnPath,
  purchaseError,
}: UseLotPurchaseArgs) {
  const navigate = useNavigate();
  const { summary, availableMinor, loading: walletLoading } = useWalletSummary();
  const [confirming, setConfirming] = useState(false);
  const [buyError, setBuyError] = useState<unknown>(null);

  const listingPriceMinor = lot?.marketplacePriceMinor ?? lot?.priceMinor ?? null;
  const priceMinor = lot ? Number(lot.priceMinor) : 0;
  const isOwnLot = Boolean(user && lot && lot.sellerId === user.id);
  const isUnavailable = Boolean(lot && lot.status !== 'ACTIVE');
  const purchaseBlocked = isPurchaseBlocked(user, requiresSteamLink, Boolean(token));
  const insufficient =
    Boolean(token) &&
    Boolean(lot) &&
    availableMinor !== null &&
    priceMinor > 0 &&
    availableMinor < priceMinor;
  const shortfallMinor =
    insufficient && availableMinor !== null ? priceMinor - availableMinor : 0;
  const depositNeededMinor = shortfallMinor > 0 ? shortfallMinor : priceMinor;
  const depositHref = `/wallet?tab=deposit&returnUrl=${encodeURIComponent(returnPath)}&needed=${depositNeededMinor}`;
  const showReadiness = Boolean(token && lot && !isOwnLot && !isUnavailable);
  const canBuy =
    Boolean(token) &&
    Boolean(lot) &&
    lot!.status === 'ACTIVE' &&
    !isOwnLot &&
    !purchaseBlocked &&
    !insufficient &&
    !confirming &&
    !walletLoading;
  const displayError = buyError ?? purchaseError;

  const state = useMemo(
    () => ({
      summary,
      availableMinor,
      walletLoading,
      listingPriceMinor,
      priceMinor,
      isOwnLot,
      isUnavailable,
      purchaseBlocked,
      insufficient,
      shortfallMinor,
      depositHref,
      showReadiness,
      canBuy,
      confirming,
      displayError,
    }),
    [
      summary,
      availableMinor,
      walletLoading,
      listingPriceMinor,
      priceMinor,
      isOwnLot,
      isUnavailable,
      purchaseBlocked,
      insufficient,
      shortfallMinor,
      depositHref,
      showReadiness,
      canBuy,
      confirming,
      displayError,
    ],
  );

  async function buy() {
    if (!lot) {
      return;
    }
    if (!token) {
      try {
        await startSteamLogin(returnPath);
      } catch {
        // Stay on page; user can retry via header Steam CTA.
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

  return { ...state, buy };
}
