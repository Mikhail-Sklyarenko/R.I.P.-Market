import type { SendOfferResult } from '@rip-market/extension-orchestrator';
import { normalizeSteamOfferId } from '@rip-market/extension-orchestrator';

export const TRADE_OFFER_INTERCEPTED_MESSAGE = 'TRADE_OFFER_INTERCEPTED';

export type InterceptedTradeOffer = {
  offerId: string;
  confirmPending: boolean;
  assetId?: string;
  buyerTradeUrl?: string;
  capturedAt: string;
};

function sentOfferStorageKey(draftId: string): string {
  return `rip:sent-offer:${draftId}`;
}

function interceptedOfferStorageKey(assetId: string): string {
  return `rip:intercepted-offer:${assetId}`;
}

export type CachedSentOffer = {
  ok: true;
  offerId: string;
  confirmPending: boolean;
  assetId?: string;
  marketHashName?: string | null;
};

export async function getCachedSentOffer(
  draftId: string,
): Promise<CachedSentOffer | null> {
  const stored = await chrome.storage.session.get(sentOfferStorageKey(draftId));
  const cached = stored[sentOfferStorageKey(draftId)] as CachedSentOffer | undefined;
  if (!cached?.ok) {
    return null;
  }
  const offerId = normalizeSteamOfferId(cached.offerId);
  if (!offerId) {
    return null;
  }
  return {
    ok: true,
    offerId,
    confirmPending: Boolean(cached.confirmPending),
    assetId: cached.assetId,
    marketHashName: cached.marketHashName ?? null,
  };
}

export async function cacheSentOffer(
  draftId: string,
  result: Extract<SendOfferResult, { ok: true }>,
  meta?: { assetId?: string; marketHashName?: string | null },
): Promise<void> {
  const offerId = normalizeSteamOfferId(result.offerId);
  if (!offerId) {
    return;
  }
  await chrome.storage.session.set({
    [sentOfferStorageKey(draftId)]: {
      ok: true,
      offerId,
      confirmPending: Boolean(result.confirmPending),
      assetId: meta?.assetId,
      marketHashName: meta?.marketHashName ?? null,
    },
  });
}

export async function recordInterceptedOffer(params: {
  offerId: string;
  confirmPending?: boolean;
  assetId?: string;
  buyerTradeUrl?: string;
}): Promise<void> {
  const offerId = normalizeSteamOfferId(params.offerId);
  if (!offerId) {
    return;
  }

  const entry: InterceptedTradeOffer = {
    offerId,
    confirmPending: Boolean(params.confirmPending),
    assetId: params.assetId,
    buyerTradeUrl: params.buyerTradeUrl,
    capturedAt: new Date().toISOString(),
  };

  const patch: Record<string, InterceptedTradeOffer> = {
    'rip:last-intercepted-offer': entry,
  };
  if (params.assetId) {
    patch[interceptedOfferStorageKey(params.assetId)] = entry;
  }
  await chrome.storage.session.set(patch);
}
