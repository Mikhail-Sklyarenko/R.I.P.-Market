import type { ExtensionApiClient } from '@rip-market/extension-orchestrator';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  interceptedOfferToLinkInput,
  tryLinkOfferToActiveOrder,
  type OfferLinkInput,
  type OfferLinkResult,
} from './offer-order-linker.js';
import type { InterceptedTradeOffer } from './trade-offer-sent-cache.js';

const LAST_INTERCEPTED_KEY = 'rip:last-intercepted-offer';

async function readLastInterceptedOffer(): Promise<InterceptedTradeOffer | null> {
  const stored = await chrome.storage.session.get(LAST_INTERCEPTED_KEY);
  const entry = stored[LAST_INTERCEPTED_KEY] as InterceptedTradeOffer | undefined;
  if (!entry?.offerId?.trim()) {
    const local = await chrome.storage.local.get(LAST_INTERCEPTED_KEY);
    return (local[LAST_INTERCEPTED_KEY] as InterceptedTradeOffer | undefined) ?? null;
  }
  return entry;
}

/**
 * Attempts to bind a captured Steam offer id to an active seller order.
 */
export async function tryLinkCapturedOffer(params: {
  client: ExtensionApiClient;
  trades: TradeVerificationResult[];
  offer: InterceptedTradeOffer | OfferLinkInput;
  source: 'intercept' | 'manual_create' | 'recovery';
}): Promise<OfferLinkResult> {
  const input =
    'capturedAt' in params.offer
      ? interceptedOfferToLinkInput(params.offer)
      : params.offer;

  return tryLinkOfferToActiveOrder({
    client: params.client,
    trades: params.trades,
    input,
    source: params.source,
  });
}

/**
 * Re-tries linking the last intercepted offer when backend still has no offerId.
 */
export async function flushPendingOfferLinks(params: {
  client: ExtensionApiClient;
  trades: TradeVerificationResult[];
}): Promise<OfferLinkResult | null> {
  const intercepted = await readLastInterceptedOffer();
  if (!intercepted?.offerId?.trim()) {
    return null;
  }

  const stillUnlinked = params.trades.some(
    (trade) =>
      trade.role === 'seller' &&
      trade.orderStatus === 'WAITING_TRADE' &&
      !trade.offerId?.trim(),
  );
  if (!stillUnlinked) {
    return null;
  }

  return tryLinkCapturedOffer({
    client: params.client,
    trades: params.trades,
    offer: intercepted,
    source: 'recovery',
  });
}
