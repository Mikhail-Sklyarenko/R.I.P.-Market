import type { SendOfferResult } from '@rip-market/extension-orchestrator';
import { normalizeSteamOfferId } from '@rip-market/extension-orchestrator';

export const TRADE_OFFER_INTERCEPTED_MESSAGE = 'TRADE_OFFER_INTERCEPTED';

/** How long an in-flight send blocks a duplicate Steam POST for the same draft. */
export const SEND_INFLIGHT_TTL_MS = 120_000;

export type InterceptedTradeOffer = {
  offerId: string;
  confirmPending: boolean;
  assetId?: string;
  buyerTradeUrl?: string;
  capturedAt: string;
};

export type CachedSentOffer = {
  ok: true;
  offerId: string;
  confirmPending: boolean;
  assetId?: string;
  marketHashName?: string | null;
  floatValue?: string | null;
};

export type SendInflightMarker = {
  draftId: string;
  assetId?: string;
  startedAt: string;
};

function sentOfferStorageKey(draftId: string): string {
  return `rip:sent-offer:${draftId}`;
}

function interceptedOfferStorageKey(assetId: string): string {
  return `rip:intercepted-offer:${assetId}`;
}

function sendInflightStorageKey(draftId: string): string {
  return `rip:send-inflight:${draftId}`;
}

async function readStorageValue<T>(
  area: 'session' | 'local',
  key: string,
): Promise<T | undefined> {
  const stored = await chrome.storage[area].get(key);
  return stored[key] as T | undefined;
}

async function writeStorageValue(
  area: 'session' | 'local',
  key: string,
  value: unknown,
): Promise<void> {
  await chrome.storage[area].set({ [key]: value });
}

async function removeStorageKeys(
  area: 'session' | 'local',
  keys: string[],
): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await chrome.storage[area].remove(keys);
}

function normalizeCachedSentOffer(
  cached: CachedSentOffer | undefined,
): CachedSentOffer | null {
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
    floatValue: cached.floatValue ?? null,
  };
}

/**
 * Durable + session lookup for a successful send.
 * Local storage survives service-worker restarts; session is faster hot path.
 */
export async function getCachedSentOffer(
  draftId: string,
): Promise<CachedSentOffer | null> {
  const sessionHit = normalizeCachedSentOffer(
    await readStorageValue<CachedSentOffer>('session', sentOfferStorageKey(draftId)),
  );
  if (sessionHit) {
    return sessionHit;
  }

  const localHit = normalizeCachedSentOffer(
    await readStorageValue<CachedSentOffer>('local', sentOfferStorageKey(draftId)),
  );
  if (localHit) {
    await writeStorageValue('session', sentOfferStorageKey(draftId), localHit);
    return localHit;
  }

  return null;
}

export async function getInterceptedOfferByAssetId(
  assetId: string,
): Promise<CachedSentOffer | null> {
  const trimmed = assetId.trim();
  if (!trimmed) {
    return null;
  }

  const sessionEntry = await readStorageValue<InterceptedTradeOffer>(
    'session',
    interceptedOfferStorageKey(trimmed),
  );
  const localEntry =
    sessionEntry ??
    (await readStorageValue<InterceptedTradeOffer>(
      'local',
      interceptedOfferStorageKey(trimmed),
    ));

  if (!localEntry) {
    return null;
  }

  const offerId = normalizeSteamOfferId(localEntry.offerId);
  if (!offerId) {
    return null;
  }

  const cached: CachedSentOffer = {
    ok: true,
    offerId,
    confirmPending: Boolean(localEntry.confirmPending),
    assetId: localEntry.assetId ?? trimmed,
    marketHashName: null,
    floatValue: null,
  };

  // Promote into draft-agnostic durable form for the next resume.
  await writeStorageValue('session', interceptedOfferStorageKey(trimmed), {
    ...localEntry,
    offerId,
  });
  await writeStorageValue('local', interceptedOfferStorageKey(trimmed), {
    ...localEntry,
    offerId,
  });

  return cached;
}

export async function cacheSentOffer(
  draftId: string,
  result: Extract<SendOfferResult, { ok: true }>,
  meta?: {
    assetId?: string;
    marketHashName?: string | null;
    floatValue?: string | null;
  },
): Promise<void> {
  const offerId = normalizeSteamOfferId(result.offerId);
  if (!offerId) {
    return;
  }

  const entry: CachedSentOffer = {
    ok: true,
    offerId,
    confirmPending: Boolean(result.confirmPending),
    assetId: meta?.assetId,
    marketHashName: meta?.marketHashName ?? null,
    floatValue: meta?.floatValue ?? null,
  };

  const patch: Record<string, unknown> = {
    [sentOfferStorageKey(draftId)]: entry,
  };
  if (meta?.assetId) {
    const intercepted: InterceptedTradeOffer = {
      offerId,
      confirmPending: entry.confirmPending,
      assetId: meta.assetId,
      capturedAt: new Date().toISOString(),
    };
    patch[interceptedOfferStorageKey(meta.assetId)] = intercepted;
    patch['rip:last-intercepted-offer'] = intercepted;
  }

  await chrome.storage.session.set(patch);
  await chrome.storage.local.set(patch);
  await clearSendInflight(draftId);
}

export async function recordInterceptedOffer(params: {
  offerId: string;
  confirmPending?: boolean;
  assetId?: string;
  buyerTradeUrl?: string;
  draftId?: string;
}): Promise<CachedSentOffer | null> {
  const offerId = normalizeSteamOfferId(params.offerId);
  if (!offerId) {
    return null;
  }

  const entry: InterceptedTradeOffer = {
    offerId,
    confirmPending: Boolean(params.confirmPending),
    assetId: params.assetId,
    buyerTradeUrl: params.buyerTradeUrl,
    capturedAt: new Date().toISOString(),
  };

  const patch: Record<string, InterceptedTradeOffer | CachedSentOffer> = {
    'rip:last-intercepted-offer': entry,
  };
  if (params.assetId) {
    patch[interceptedOfferStorageKey(params.assetId)] = entry;
  }

  const cached: CachedSentOffer = {
    ok: true,
    offerId,
    confirmPending: entry.confirmPending,
    assetId: params.assetId,
    marketHashName: null,
    floatValue: null,
  };

  if (params.draftId) {
    patch[sentOfferStorageKey(params.draftId)] = cached;
  }

  await chrome.storage.session.set(patch);
  await chrome.storage.local.set(patch);
  if (params.draftId) {
    await clearSendInflight(params.draftId);
  }

  return cached;
}

export async function markSendInflight(params: {
  draftId: string;
  assetId?: string;
}): Promise<void> {
  const marker: SendInflightMarker = {
    draftId: params.draftId,
    assetId: params.assetId,
    startedAt: new Date().toISOString(),
  };
  await writeStorageValue('session', sendInflightStorageKey(params.draftId), marker);
  await writeStorageValue('local', sendInflightStorageKey(params.draftId), marker);
}

export async function clearSendInflight(draftId: string): Promise<void> {
  const key = sendInflightStorageKey(draftId);
  await removeStorageKeys('session', [key]);
  await removeStorageKeys('local', [key]);
}

export async function getSendInflight(
  draftId: string,
): Promise<SendInflightMarker | null> {
  const session =
    (await readStorageValue<SendInflightMarker>(
      'session',
      sendInflightStorageKey(draftId),
    )) ??
    (await readStorageValue<SendInflightMarker>(
      'local',
      sendInflightStorageKey(draftId),
    ));
  if (!session?.startedAt) {
    return null;
  }
  const startedAt = Date.parse(session.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > SEND_INFLIGHT_TTL_MS) {
    await clearSendInflight(draftId);
    return null;
  }
  return session;
}

/**
 * Prefer a durable success record over another Steam POST.
 * Order: draft cache → asset intercept → fresh inflight (wait out) is handled by caller.
 */
export async function resolvePriorSuccessfulSend(params: {
  draftId: string;
  assetId?: string;
}): Promise<CachedSentOffer | null> {
  const byDraft = await getCachedSentOffer(params.draftId);
  if (byDraft) {
    return byDraft;
  }
  if (params.assetId) {
    return getInterceptedOfferByAssetId(params.assetId);
  }
  return null;
}
