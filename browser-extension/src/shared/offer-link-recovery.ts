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
/** Drop leftover intercepts from prior QA deals / abandoned tabs. */
const INTERCEPT_MAX_AGE_MS = 30 * 60 * 1000;

async function readLastInterceptedOffer(): Promise<InterceptedTradeOffer | null> {
  const stored = await chrome.storage.session.get(LAST_INTERCEPTED_KEY);
  const entry = stored[LAST_INTERCEPTED_KEY] as InterceptedTradeOffer | undefined;
  if (!entry?.offerId?.trim()) {
    const local = await chrome.storage.local.get(LAST_INTERCEPTED_KEY);
    return (local[LAST_INTERCEPTED_KEY] as InterceptedTradeOffer | undefined) ?? null;
  }
  return entry;
}

export async function clearLastInterceptedOffer(): Promise<void> {
  await chrome.storage.session.remove(LAST_INTERCEPTED_KEY);
  await chrome.storage.local.remove(LAST_INTERCEPTED_KEY);
}

function isInterceptStale(entry: InterceptedTradeOffer, nowMs = Date.now()): boolean {
  const capturedAt = Date.parse(entry.capturedAt);
  if (!Number.isFinite(capturedAt)) {
    return true;
  }
  return nowMs - capturedAt > INTERCEPT_MAX_AGE_MS;
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

  const result = await tryLinkOfferToActiveOrder({
    client: params.client,
    trades: params.trades,
    input,
    source: params.source,
  });

  if (result.linked) {
    await clearLastInterceptedOffer();
    return result;
  }

  // Asset/order mismatch with an open unlinked deal: drop so recovery cannot
  // glue a prior offer onto the next purchase. Keep the intercept when the
  // trade list is empty (race before first poll).
  if (result.reason === 'no_match') {
    const hasUnlinkedSeller = params.trades.some(
      (trade) =>
        trade.role === 'seller' &&
        trade.orderStatus === 'WAITING_TRADE' &&
        !trade.offerId?.trim(),
    );
    if (hasUnlinkedSeller || params.source === 'recovery') {
      await clearLastInterceptedOffer();
    }
  }

  return result;
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

  if (isInterceptStale(intercepted)) {
    await clearLastInterceptedOffer();
    return null;
  }

  const stillUnlinked = params.trades.some(
    (trade) =>
      trade.role === 'seller' &&
      trade.orderStatus === 'WAITING_TRADE' &&
      !trade.offerId?.trim(),
  );
  if (!stillUnlinked) {
    // Active deals already have offer ids (or none waiting) — drop leftover.
    await clearLastInterceptedOffer();
    return null;
  }

  return tryLinkCapturedOffer({
    client: params.client,
    trades: params.trades,
    offer: intercepted,
    source: 'recovery',
  });
}
