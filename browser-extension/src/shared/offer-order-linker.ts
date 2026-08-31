import type {
  ExtensionApiClient,
  TradeVerificationResult,
} from '@rip-market/extension-orchestrator';
import { normalizeSteamOfferId } from '@rip-market/extension-orchestrator';
import type { InterceptedTradeOffer } from './trade-offer-sent-cache.js';

export type OfferLinkInput = {
  offerId: string;
  assetId?: string | null;
  buyerTradeUrl?: string | null;
};

export type OfferLinkResult =
  | { linked: true; orderId: string; idempotent: boolean }
  | { linked: false; reason: 'invalid_offer' | 'no_match' | 'api_error' };

/**
 * Pick the seller order waiting for trade that best matches a Steam offer.
 */
export function findOfferLinkTarget(
  trades: TradeVerificationResult[],
  input: OfferLinkInput,
): TradeVerificationResult | null {
  const offerId = normalizeSteamOfferId(input.offerId);
  if (!offerId) {
    return null;
  }

  let candidates = trades.filter(
    (trade) =>
      trade.role === 'seller' &&
      trade.orderStatus === 'WAITING_TRADE' &&
      !trade.offerId?.trim(),
  );
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  const assetId = input.assetId?.trim();
  if (assetId) {
    const byAsset = candidates.filter(
      (trade) => trade.item.assetExternalId?.trim() === assetId,
    );
    if (byAsset.length > 0) {
      candidates = byAsset;
    }
  }

  const buyerTradeUrl = input.buyerTradeUrl?.trim();
  if (buyerTradeUrl && candidates.length > 1) {
    const byUrl = candidates.filter(
      (trade) => trade.buyerTradeUrl?.trim() === buyerTradeUrl,
    );
    if (byUrl.length > 0) {
      candidates = byUrl;
    }
  }

  return candidates[0] ?? null;
}

export async function linkOfferToOrder(params: {
  client: ExtensionApiClient;
  orderId: string;
  offerId: string;
  source: 'intercept' | 'manual_create' | 'recovery';
}): Promise<OfferLinkResult> {
  const offerId = normalizeSteamOfferId(params.offerId);
  if (!offerId) {
    return { linked: false, reason: 'invalid_offer' };
  }

  try {
    const result = await params.client.submitTradeReference({
      orderId: params.orderId,
      offerId,
      idempotencyKey: `ext-link:${params.source}:${params.orderId}:${offerId}`,
    });
    return {
      linked: true,
      orderId: result.orderId,
      idempotent: result.idempotent,
    };
  } catch {
    return { linked: false, reason: 'api_error' };
  }
}

export async function tryLinkOfferToActiveOrder(params: {
  client: ExtensionApiClient;
  trades: TradeVerificationResult[];
  input: OfferLinkInput;
  source: 'intercept' | 'manual_create' | 'recovery';
}): Promise<OfferLinkResult> {
  const target = findOfferLinkTarget(params.trades, params.input);
  if (!target) {
    return { linked: false, reason: 'no_match' };
  }
  return linkOfferToOrder({
    client: params.client,
    orderId: target.orderId,
    offerId: params.input.offerId,
    source: params.source,
  });
}

export function interceptedOfferToLinkInput(
  offer: InterceptedTradeOffer,
): OfferLinkInput {
  return {
    offerId: offer.offerId,
    assetId: offer.assetId ?? null,
    buyerTradeUrl: offer.buyerTradeUrl ?? null,
  };
}
