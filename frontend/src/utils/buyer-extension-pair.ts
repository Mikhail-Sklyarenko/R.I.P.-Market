import type { Order } from '../api/types.ts';

export type BuyerExtensionPairMoment = {
  /** Offer is ready — buyer should pair for safe accept overlay. */
  showPairPrompt: boolean;
  /** Extension already paired — show ready / open-offer hint. */
  showReadyHint: boolean;
  offerId: string | null;
  steamOfferUrl: string | null;
};

/**
 * C1: surface buyer pairing on the order page at the right moment —
 * WAITING_TRADE after the seller offer is linked — not only on Account.
 */
export function resolveBuyerExtensionPairMoment(params: {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
  extensionTradeAckEnabled: boolean;
  extensionConnected: boolean | null | undefined;
}): BuyerExtensionPairMoment {
  const offerId = params.order.tradeOperation?.externalOfferId?.trim() || null;
  const steamOfferUrl = offerId
    ? `https://steamcommunity.com/tradeoffer/${offerId}/`
    : null;

  const atMoment =
    params.role === 'buyer' &&
    params.order.status === 'WAITING_TRADE' &&
    params.extensionTradeAckEnabled &&
    Boolean(offerId) &&
    params.order.tradeVerification?.status !== 'mismatch';

  if (!atMoment) {
    return {
      showPairPrompt: false,
      showReadyHint: false,
      offerId,
      steamOfferUrl,
    };
  }

  if (params.extensionConnected) {
    return {
      showPairPrompt: false,
      showReadyHint: true,
      offerId,
      steamOfferUrl,
    };
  }

  return {
    showPairPrompt: true,
    showReadyHint: false,
    offerId,
    steamOfferUrl,
  };
}
