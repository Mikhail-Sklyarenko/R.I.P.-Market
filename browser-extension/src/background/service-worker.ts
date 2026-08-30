import {
  CreateOfferOrchestrator,
  ExtensionApiClient,
  ExtensionApiError,
  HttpTaskProgressReporter,
  OfferErrorCode,
  isExtensionAuthError,
  parseExtensionApiError,
  type TaskProgressReporter,
  type TradeVerificationResult,
} from '@rip-market/extension-orchestrator';
import { MessageSteamOfferAdapter } from '../adapters/message-steam-offer-adapter.js';
import { SteamCommunityClient } from '../shared/steam-community-client.js';
import {
  assertSessionDeviceConsistency,
  clearSessionState,
  ensureDeviceKeys,
  getDefaultApiBaseUrl,
  getSessionState,
  saveSessionState,
  signMessage,
  type ExtensionSessionState,
} from '../shared/storage.js';
import {
  applyTaskUiTradeFlowFlag,
  setTaskUiTradeFlowOverride,
  isExtensionQuietNotificationsEnabled,
  syncUiTradeFlowFromAuthConfig,
} from '../shared/extension-flags.js';
import {
  countActionableTrades,
  getActiveTradesCache,
  isActiveTradesCacheFresh,
  isTradeAcknowledgmentEnabled,
  setActiveTradesCache,
} from '../shared/active-trades-cache.js';
import {
  parsePollScheduleMode,
  periodsForPollMode,
  resolvePollScheduleMode,
  POLL_MODE_STORAGE_KEY,
  type PollScheduleMode,
} from '../shared/poll-schedule.js';
import {
  getStoredSiteLinkSnapshot,
  persistSiteLinkFromPoll,
  safeModeBlockMessage,
  type SiteLinkSnapshot,
} from '../shared/offline-safe-mode.js';
import { recordTwoMinuteFirstList } from '../shared/two-minute-onboarding.js';
import { humanizeListingApiError } from '../shared/listing-api-errors.js';
import {
  buildSupportBridgePack,
  buildSupportBridgeUrl,
  formatSupportBridgeTicketBody,
  siteOriginFromApiBaseUrl as supportSiteOriginFromApiBaseUrl,
  type SupportBridgePack,
} from '../shared/support-bridge.js';
import {
  canProceedPastRateLimit,
  noteRateLimitCleared,
  noteRateLimitHit,
} from '../shared/rate-limit-backoff-runtime.js';
import { parseRetryAfterMs } from '../shared/rate-limit-backoff.js';
import {
  handleQuietNotificationButton,
  handleQuietNotificationClick,
  loadQuietNotifyState,
  processQuietNotifications,
  setQuietNotificationsEnabled,
  unmuteQuietNotifyDeal,
} from '../shared/quiet-notifications-runtime.js';
import {
  buildOpsHealthSnapshot,
  loadOpsHealthPollState,
  recordActiveTradesPollSuccess,
  recordPollFailure,
  recordRateLimitedHit,
  recordTaskPollSuccess,
} from '../shared/extension-ops-health-runtime.js';
import { resolveLastSuccessfulPollAt } from '../shared/extension-ops-health.js';
import {
  buildManualCreateCandidate,
  buildManualCreateDraftInput,
} from '../shared/manual-create-offer.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';
import {
  recordInterceptedOffer,
  TRADE_OFFER_INTERCEPTED_MESSAGE,
} from '../shared/trade-offer-sent-cache.js';
import { loadCs2InventoryFromCookies } from '../shared/steam-cookie-client.js';
import {
  buildPlatformFactsMap,
  type PlatformInventoryAssetRow,
} from '../shared/inventory-enrichment-data.js';
import type { InventoryItemPlatformFacts } from '../shared/inventory-item-enrichment.js';
import {
  loadCs2EnrichmentFactsInPageMain,
  type PageEnrichmentLoadResult,
} from '../shared/steam-inventory-page-enrichment.js';
import { chunkMarketHashNames } from '../shared/inventory-price-intel.js';
import type { InventoryPriceHintLike } from '../shared/inventory-price-intel.js';
import {
  collectActiveTradeTaskAssets,
  getActiveTradeTaskAssetsCache,
  setActiveTradeTaskAssetsCache,
} from '../shared/active-trade-task-assets.js';
import {
  findPlatformAssetIdByExternalId,
  siteListingsUrl,
  siteLotUrl,
  validateCreateLotPriceMinor,
} from '../shared/inventory-one-click-sell.js';
import {
  evaluateCheckedInventoryAsset,
} from '../shared/inventory-prelist-safety.js';
import {
  MAX_BULK_LISTING_COUNT,
  MIN_BULK_LISTING_COUNT,
  type BulkSellOperation,
} from '../shared/inventory-bulk-sell.js';
import {
  siteAccountUrl,
  siteOriginFromApiBaseUrl,
} from '../shared/steam-inventory-page.js';
import { hasValidTradeUrl } from '../shared/inventory-seller-onboarding.js';
import {
  buildSessionHealth,
  clearLastSessionDiag,
  offerErrorToSessionHealthCode,
  probeSessionHealth,
  saveLastSessionDiag,
  type SessionHealth,
} from '../shared/session-health.js';

const POLL_ALARM = 'rip-market-poll-tasks';
const ACTIVE_TRADES_ALARM = 'rip-market-poll-active-trades';
const HEARTBEAT_ALARM = 'rip-market-heartbeat';
const processingTasks = new Set<string>();
let pollInFlight: Promise<void> | null = null;

async function invalidateSessionOnAuthError(
  error: unknown,
  options?: {
    taskId?: string;
    reporter?: TaskProgressReporter;
  },
): Promise<void> {
  if (!isExtensionAuthError(error)) {
    return;
  }
  console.warn('[rip-market] extension session invalid — clearing local session');

  if (options?.taskId && options.reporter) {
    try {
      await options.reporter.report({
        taskId: options.taskId,
        phase: 'OFFER_FAILED',
        idempotencyKey: `progress:${options.taskId}:OFFER_FAILED:SESSION_REVOKED`,
        reasonCode: OfferErrorCode.SESSION_REVOKED,
        details: {
          message: 'Extension session revoked — reconnect from Account page',
        },
      });
    } catch {
      // Best-effort: session may already be dead.
    }
  }

  const health = buildSessionHealth({
    code: 'SESSION_REVOKED',
    messageOverride:
      'Сессия расширения истекла. Откройте сайт → Аккаунт → «Подключить расширение».',
  });
  await saveLastSessionDiag(health);
  await clearSessionState();
  await chrome.alarms.clearAll();
}

export async function pairExtension(params: {
  userJwt: string;
  apiBaseUrl?: string;
  locale?: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  try {
    await disconnectExtension();
    if (params.locale) {
      const { normalizeExtensionLocale, setStoredExtensionLocale } =
        await import('../shared/extension-i18n.js');
      await setStoredExtensionLocale(normalizeExtensionLocale(params.locale));
    }
    const keys = await ensureDeviceKeys();
    const apiBaseUrl = params.apiBaseUrl?.replace(/\/$/, '') ?? getDefaultApiBaseUrl();
    const client = new ExtensionApiClient(
      apiBaseUrl,
      {
        sessionId: '',
        deviceId: keys.deviceId,
        accessToken: '',
        expiresAt: '',
      },
      (message) => signMessage(keys.privateKeyJwk, message),
    );
    const session = await client.handshake({
      userJwt: params.userJwt,
      deviceId: keys.deviceId,
      publicKeyPem: keys.publicKeyPem,
    });
    const state: ExtensionSessionState = {
      ...session,
      deviceId: keys.deviceId,
      apiBaseUrl,
    };
    await saveSessionState(state);
    await syncUiTradeFlowFromAuthConfig(apiBaseUrl);
    await clearLastSessionDiag();
    await scheduleAlarms();
    void pollAndProcessTasks();
    void pollActiveTrades();
    return { ok: true, sessionId: session.sessionId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Pairing failed',
    };
  }
}

export async function disconnectExtension(): Promise<void> {
  const state = await getSessionState();
  if (state) {
    try {
      const keys = await ensureDeviceKeys();
      const client = buildClient(state, keys, keys.privateKeyJwk);
      await client.revokeSession();
    } catch {
      // Best-effort revoke
    }
  }
  await clearSessionState();
  await chrome.alarms.clearAll();
}

export async function getExtensionStatus(): Promise<{
  connected: boolean;
  sessionId?: string;
  expiresAt?: string;
  apiBaseUrl?: string;
}> {
  const state = await getSessionState();
  if (!state) {
    return { connected: false };
  }
  const expired = Date.parse(state.expiresAt) <= Date.now();
  if (expired) {
    return { connected: false, apiBaseUrl: state.apiBaseUrl };
  }
  return {
    connected: true,
    sessionId: state.sessionId,
    expiresAt: state.expiresAt,
    apiBaseUrl: state.apiBaseUrl,
  };
}

async function buildExtensionDebugPack(params?: {
  expectedSteamId?: string;
  probeInventory?: boolean;
}): Promise<{
  pack: Record<string, unknown>;
  supportBridge: SupportBridgePack;
  clipboardText: string;
  supportUrl: string;
}> {
  const status = await getExtensionStatus();
  const health = await probeSessionHealth({
    expectedSteamId: params?.expectedSteamId,
    probeInventory: params?.probeInventory !== false,
  });
  if (health.code === 'INVENTORY_RATE_LIMITED') {
    await recordRateLimitedHit();
  }
  const manifest = chrome.runtime.getManifest();
  const ops = await buildOpsHealthSnapshot({
    connected: Boolean(status.connected),
    health,
    extensionVersion: manifest.version ?? '0',
  });
  const cache = await getActiveTradesCache();
  const siteLink = await getStoredSiteLinkSnapshot();
  const supportBridge = buildSupportBridgePack({
    extensionVersion: manifest.version ?? '0',
    extensionId: chrome.runtime.id,
    connected: Boolean(status.connected),
    sessionHealthCode: health.code,
    healthSupportCode: health.supportCode,
    siteLinkMode: siteLink.mode,
    trades: cache?.trades ?? [],
  });
  const supportUrl = buildSupportBridgeUrl({
    siteOrigin: supportSiteOriginFromApiBaseUrl(status.apiBaseUrl),
    pack: supportBridge,
  });
  const clipboardText = formatSupportBridgeTicketBody(supportBridge);
  return {
    pack: {
      version: 1,
      capturedAt: supportBridge.capturedAt,
      extensionVersion: supportBridge.extensionVersion,
      extensionId: supportBridge.extensionId,
      connected: supportBridge.connected,
      expiresAt: status.expiresAt ?? null,
      apiBaseUrl: status.apiBaseUrl ?? null,
      // H6 catalog fields (also nested under supportBridge).
      orderId: supportBridge.primaryOrderId,
      phase: supportBridge.deals[0]?.phase ?? null,
      errorCode: supportBridge.errorCode,
      steamMatch: supportBridge.steamMatch,
      sessionHealth: {
        code: health.code,
        supportCode: health.supportCode,
        title: health.title,
        message: health.message,
        sessionSteamId: health.sessionSteamId,
        expectedSteamId: health.expectedSteamId,
        checkedAt: health.checkedAt,
      },
      opsHealth: ops.snapshot,
      opsHealthView: ops.view,
      supportBridge,
      supportUrl,
    },
    supportBridge,
    clipboardText,
    supportUrl,
  };
}

export async function scheduleAlarms(
  mode: PollScheduleMode = 'active',
): Promise<void> {
  const periods = periodsForPollMode(mode);
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.alarms.clear(ACTIVE_TRADES_ALARM);
  await chrome.alarms.clear(HEARTBEAT_ALARM);
  await chrome.alarms.create(POLL_ALARM, {
    periodInMinutes: periods.tasksMinutes,
  });
  await chrome.alarms.create(ACTIVE_TRADES_ALARM, {
    periodInMinutes: periods.activeTradesMinutes,
  });
  await chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: periods.heartbeatMinutes,
  });
  await chrome.storage.session.set({ [POLL_MODE_STORAGE_KEY]: mode });
}

async function readStoredPollMode(): Promise<PollScheduleMode | null> {
  try {
    const stored = await chrome.storage.session.get(POLL_MODE_STORAGE_KEY);
    return parsePollScheduleMode(stored[POLL_MODE_STORAGE_KEY]);
  } catch {
    return null;
  }
}

/**
 * I4: flip idle ↔ active alarm cadence when deal state changes.
 * Returns true when mode changed (caller may want an immediate wake poll).
 */
export async function syncPollSchedule(params: {
  trades?: TradeVerificationResult[] | null;
  pendingTaskCount?: number | null;
  backendHasPendingWork?: boolean | null;
  backendHasActiveDeal?: boolean | null;
}): Promise<{ mode: PollScheduleMode; changed: boolean }> {
  const mode = resolvePollScheduleMode({
    trades: params.trades,
    pendingTaskCount: params.pendingTaskCount,
    backendHasPendingWork: params.backendHasPendingWork,
    backendHasActiveDeal: params.backendHasActiveDeal,
  });
  const previous = await readStoredPollMode();
  if (previous === mode) {
    return { mode, changed: false };
  }
  await scheduleAlarms(mode);
  return { mode, changed: true };
}

function buildClient(
  state: ExtensionSessionState,
  keys: Awaited<ReturnType<typeof ensureDeviceKeys>>,
  privateKeyJwk: JsonWebKey,
): ExtensionApiClient {
  return new ExtensionApiClient(
    state.apiBaseUrl,
    {
      sessionId: state.sessionId,
      deviceId: keys.deviceId,
      accessToken: state.accessToken,
      expiresAt: state.expiresAt,
    },
    (message) => signMessage(privateKeyJwk, message),
  );
}

async function ensureFreshSession(
  client: ExtensionApiClient,
  state: ExtensionSessionState,
): Promise<ExtensionSessionState | null> {
  const latest = (await getSessionState()) ?? state;
  client.updateSession({
    sessionId: latest.sessionId,
    deviceId: latest.deviceId,
    accessToken: latest.accessToken,
    expiresAt: latest.expiresAt,
  });

  const expiresMs = Date.parse(latest.expiresAt);
  if (expiresMs - Date.now() > 60_000) {
    return latest;
  }

  try {
    const rotated = await client.rotateSession();
    const next: ExtensionSessionState = {
      sessionId: rotated.sessionId,
      deviceId: latest.deviceId,
      accessToken: rotated.accessToken,
      expiresAt: rotated.expiresAt,
      apiBaseUrl: latest.apiBaseUrl,
    };
    await saveSessionState(next);
    return next;
  } catch (error) {
    if (isExtensionAuthError(error)) {
      await invalidateSessionOnAuthError(error);
      return null;
    }
    throw error;
  }
}

async function buildAuthenticatedClient(): Promise<{
  client: ExtensionApiClient;
  state: ExtensionSessionState;
} | null> {
  if (!(await assertSessionDeviceConsistency())) {
    return null;
  }
  const state = await getSessionState();
  if (!state || Date.parse(state.expiresAt) <= Date.now()) {
    if (state) {
      await clearSessionState();
    }
    return null;
  }

  const keys = await ensureDeviceKeys();
  let client = buildClient(state, keys, keys.privateKeyJwk);
  const freshState = await ensureFreshSession(client, state);
  if (!freshState) {
    return null;
  }
  client = buildClient(freshState, keys, keys.privateKeyJwk);
  return { client, state: freshState };
}

export async function pollActiveTrades(options?: {
  force?: boolean;
}): Promise<TradeVerificationResult[]> {
  if (!(await isTradeAcknowledgmentEnabled())) {
    await setActiveTradesCache([]);
    await chrome.action.setBadgeText({ text: '' });
    return [];
  }

  const force = options?.force === true;
  const cached = await getActiveTradesCache();
  if (!force && isActiveTradesCacheFresh(cached)) {
    return cached!.trades;
  }

  if (!force && !(await canProceedPastRateLimit())) {
    return cached?.trades ?? [];
  }

  const auth = await buildAuthenticatedClient();
  if (!auth) {
    await rememberSiteLink({
      paired: false,
      liveFetchOk: false,
      fromCache: Boolean(cached?.trades?.length),
      cacheUpdatedAt: cached?.updatedAt ?? null,
      lastError: 'not_paired',
    });
    return cached?.trades ?? [];
  }

  try {
    const trades = await auth.client.listActiveTrades(25);
    await setActiveTradesCache(trades);
    await noteRateLimitCleared();
    await recordActiveTradesPollSuccess();
    const refreshed = await getActiveTradesCache();
    await rememberSiteLink({
      paired: true,
      liveFetchOk: true,
      fromCache: false,
      cacheUpdatedAt: refreshed?.updatedAt ?? null,
      lastError: null,
    });
    const actionable = countActionableTrades(trades);
    await chrome.action.setBadgeText({
      text: actionable > 0 ? String(actionable) : '',
    });
    await chrome.action.setBadgeBackgroundColor({ color: '#5b8def' });
    void (async () => {
      if (!(await isExtensionQuietNotificationsEnabled())) {
        return;
      }
      await processQuietNotifications(trades);
    })().catch((error) => {
      console.warn('[rip-market] quiet notifications failed', error);
    });
    void syncPollSchedule({ trades }).catch((error) => {
      console.warn('[rip-market] poll schedule sync failed', error);
    });
    return trades;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Active trades poll failed';
    const is429 =
      /HTTP 429|rate.?limit|too many requests/i.test(message) ||
      (error as { status?: number })?.status === 429;
    if (is429) {
      const retryAfterMs = parseRetryAfterMs(
        (error as { retryAfter?: string })?.retryAfter ?? null,
      );
      await noteRateLimitHit(retryAfterMs);
      await recordRateLimitedHit();
      await recordPollFailure(message);
      await rememberSiteLink({
        paired: true,
        liveFetchOk: false,
        fromCache: Boolean(cached?.trades?.length),
        cacheUpdatedAt: cached?.updatedAt ?? null,
        lastError: message,
      });
      return cached?.trades ?? [];
    }
    await recordPollFailure(message);
    await invalidateSessionOnAuthError(error);
    await rememberSiteLink({
      paired: true,
      liveFetchOk: false,
      fromCache: Boolean(cached?.trades?.length),
      cacheUpdatedAt: cached?.updatedAt ?? null,
      lastError: message,
    });
    // H4: always prefer durable/session cache over throwing when site is down.
    return cached?.trades ?? [];
  }
}

async function rememberSiteLink(params: {
  paired: boolean;
  liveFetchOk: boolean | null;
  fromCache: boolean;
  cacheUpdatedAt: string | null;
  lastError: string | null;
}): Promise<SiteLinkSnapshot> {
  const poll = await loadOpsHealthPollState();
  return persistSiteLinkFromPoll({
    paired: params.paired,
    lastSuccessfulPollAt: resolveLastSuccessfulPollAt(poll),
    lastPollErrorAt: poll.lastPollErrorAt,
    lastPollErrorMessage: poll.lastPollErrorMessage,
    liveFetchOk: params.liveFetchOk,
    fromCache: params.fromCache,
    cacheUpdatedAt: params.cacheUpdatedAt,
    lastError: params.lastError,
  });
}

async function assertSiteMutationsAllowed(): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const link = await getStoredSiteLinkSnapshot();
  if (!link.safeMode) {
    return { ok: true };
  }
  const { getStoredExtensionLocale } = await import(
    '../shared/extension-i18n.js'
  );
  return {
    ok: false,
    error: safeModeBlockMessage(await getStoredExtensionLocale()),
  };
}

async function verifyTradeFromRuntime(params: {
  orderId?: string;
  offerId?: string;
  observedAssetId?: string;
  observedFloatValue?: string;
}): Promise<TradeVerificationResult | null> {
  const hasObserved = Boolean(
    params.observedAssetId?.trim() || params.observedFloatValue?.trim(),
  );
  const cache = await getActiveTradesCache();
  if (params.offerId && cache && !hasObserved) {
    const cached = cache.trades.find((trade) => trade.offerId === params.offerId);
    if (cached) {
      return cached;
    }
  }

  const auth = await buildAuthenticatedClient();
  if (!auth) {
    return null;
  }

  const observed = {
    assetId: params.observedAssetId ?? null,
    floatValue: params.observedFloatValue ?? null,
  };

  if (params.orderId) {
    return auth.client.verifyTrade(params.orderId, params.offerId ?? null, observed);
  }

  if (params.offerId && cache) {
    const byOffer = cache.trades.find((trade) => trade.offerId === params.offerId);
    if (byOffer) {
      return auth.client.verifyTrade(byOffer.orderId, params.offerId, observed);
    }
  }

  return null;
}

async function acknowledgeTradeFromRuntime(params: {
  orderId: string;
  ackType: 'SELLER_ACK_SENT' | 'BUYER_ACK_PRE_ACCEPT' | 'BUYER_ACK_RECEIVED';
  offerId?: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const auth = await buildAuthenticatedClient();
  if (!auth) {
    return { ok: false, error: 'Расширение не подключено' };
  }

  try {
    await auth.client.acknowledgeTrade({
      orderId: params.orderId,
      type: params.ackType,
      offerId: params.offerId,
      idempotencyKey: params.idempotencyKey,
    });
    await pollActiveTrades({ force: true });
    return { ok: true };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Acknowledgment failed',
    };
  }
}

async function loadInventoryPlatformStatus(): Promise<{
  byAssetId: Record<string, InventoryItemPlatformFacts>;
  connected: boolean;
}> {
  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return { byAssetId: {}, connected: false };
  }

  const siteOrigin = siteOriginFromApiBaseUrl(state.apiBaseUrl);
  const dealAssetIds = new Set<string>();
  const dealOrderByAssetId = new Map<
    string,
    { orderId: string; siteUrl: string }
  >();

  const cache = await getActiveTradesCache();
  for (const trade of cache?.trades ?? []) {
    if (trade.role !== 'seller') {
      continue;
    }
    const assetId = trade.item.assetExternalId?.trim();
    if (!assetId) {
      continue;
    }
    dealAssetIds.add(assetId);
    dealOrderByAssetId.set(assetId, {
      orderId: trade.orderId,
      siteUrl: trade.siteUrl,
    });
  }

  const tradeTaskCache = await getActiveTradeTaskAssetsCache();
  const tradeTaskAssetIds = new Set<string>();
  const tradeTaskOrderByAssetId = new Map<
    string,
    { orderId: string; siteUrl: string }
  >();
  for (const [assetId, entry] of Object.entries(
    tradeTaskCache?.byAssetId ?? {},
  )) {
    tradeTaskAssetIds.add(assetId);
    if (entry.orderId) {
      tradeTaskOrderByAssetId.set(assetId, {
        orderId: entry.orderId,
        siteUrl:
          entry.siteUrl ??
          `${siteOrigin}/orders/${entry.orderId}`,
      });
    }
  }

  let assets: PlatformInventoryAssetRow[] = [];
  try {
    const response = await fetch(`${state.apiBaseUrl.replace(/\/$/, '')}/inventory`, {
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        Accept: 'application/json',
      },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        assets?: PlatformInventoryAssetRow[];
      };
      assets = body.assets ?? [];
    }
  } catch {
    // Platform inventory is best-effort for badges; Steam enrichment still works.
  }

  const map = buildPlatformFactsMap({
    assets,
    dealAssetIds,
    dealOrderByAssetId,
    tradeTaskAssetIds,
    tradeTaskOrderByAssetId,
    siteOrigin,
  });

  return {
    connected: true,
    byAssetId: Object.fromEntries(map.entries()),
  };
}

async function loadInventoryPriceHints(
  marketHashNames: string[],
  cacheOnly = true,
): Promise<{
  hints: Record<string, InventoryPriceHintLike>;
  connected: boolean;
}> {
  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return { hints: {}, connected: false };
  }

  const chunks = chunkMarketHashNames(marketHashNames, 60);
  const hints: Record<string, InventoryPriceHintLike> = {};
  const base = state.apiBaseUrl.replace(/\/$/, '');

  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }
    try {
      // I2: extension-session suggested-prices (preferred).
      const suggested = await fetch(
        `${base}/extension/inventory/suggested-prices`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: chunk.map((marketHashName) => ({ marketHashName })),
            cacheOnly,
          }),
        },
      );
      if (suggested.ok) {
        const body = (await suggested.json()) as {
          results?: Array<{
            marketHashName?: string | null;
            steamGuideMinor?: number | null;
            ripMinAskMinor?: string | number | null;
            bestBidMinor?: string | number | null;
            bestBidQuantity?: number | null;
            suggestedListMinor?: number | null;
            suggestedListSource?: 'bid' | 'steam_discount' | null;
            commissionMinor?: number | null;
            sellerReceiveMinor?: number | null;
          }>;
        };
        for (const row of body.results ?? []) {
          const name = row.marketHashName?.trim();
          if (!name) {
            continue;
          }
          hints[name] = {
            steamPriceMinor: row.steamGuideMinor ?? null,
            minMarketplacePriceMinor: row.ripMinAskMinor ?? null,
            bestBidMinor: row.bestBidMinor ?? null,
            bestBidQuantity: row.bestBidQuantity ?? null,
            suggestedListMinor: row.suggestedListMinor ?? null,
            suggestedListSource: row.suggestedListSource ?? null,
            commissionMinor: row.commissionMinor ?? null,
            sellerReceiveMinor: row.sellerReceiveMinor ?? null,
          };
        }
        continue;
      }

      // Compat: legacy JWT inventory price-hints.
      const response = await fetch(`${base}/inventory/price-hints`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          marketHashNames: chunk,
          cacheOnly,
        }),
      });
      if (!response.ok) {
        continue;
      }
      const body = (await response.json()) as {
        hints?: Record<string, InventoryPriceHintLike>;
      };
      Object.assign(hints, body.hints ?? {});
    } catch {
      // Best-effort: Steam enrichment still works without price strip.
    }
  }

  return { connected: true, hints };
}

type SellerOnboardingStatusCache = {
  fetchedAt: number;
  tradeUrl: string | null;
};

const SELLER_ONBOARDING_TTL_MS = 60_000;
let sellerOnboardingCache: SellerOnboardingStatusCache | null = null;

async function loadSellerOnboardingStatus(force = false): Promise<{
  connected: boolean;
  tradeUrl: string | null;
  tradeUrlReady: boolean;
  accountUrl: string;
}> {
  const state = await getSessionState();
  const accountUrl = siteAccountUrl(state?.apiBaseUrl);
  if (!state?.accessToken || !state.apiBaseUrl) {
    return {
      connected: false,
      tradeUrl: null,
      tradeUrlReady: false,
      accountUrl,
    };
  }

  const now = Date.now();
  if (
    !force &&
    sellerOnboardingCache &&
    now - sellerOnboardingCache.fetchedAt < SELLER_ONBOARDING_TTL_MS
  ) {
    return {
      connected: true,
      tradeUrl: sellerOnboardingCache.tradeUrl,
      tradeUrlReady: hasValidTradeUrl(sellerOnboardingCache.tradeUrl),
      accountUrl,
    };
  }

  const base = state.apiBaseUrl.replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        const apiError = await readListingApiError('/users/me', response);
        await invalidateSessionOnAuthError(apiError);
      }
      return {
        connected: true,
        tradeUrl: sellerOnboardingCache?.tradeUrl ?? null,
        tradeUrlReady: hasValidTradeUrl(sellerOnboardingCache?.tradeUrl),
        accountUrl,
      };
    }
    const body = (await response.json()) as { tradeUrl?: string | null };
    const tradeUrl =
      typeof body.tradeUrl === 'string' && body.tradeUrl.trim()
        ? body.tradeUrl.trim()
        : null;
    sellerOnboardingCache = { fetchedAt: now, tradeUrl };
    return {
      connected: true,
      tradeUrl,
      tradeUrlReady: hasValidTradeUrl(tradeUrl),
      accountUrl,
    };
  } catch {
    return {
      connected: true,
      tradeUrl: sellerOnboardingCache?.tradeUrl ?? null,
      tradeUrlReady: hasValidTradeUrl(sellerOnboardingCache?.tradeUrl),
      accountUrl,
    };
  }
}

/** I3: map listing HTTP failures to ExtensionApiError so 401 clears the session. */
async function readListingApiError(
  path: string,
  response: Response,
): Promise<ExtensionApiError> {
  const text = await response.text();
  if (text.trim()) {
    return parseExtensionApiError(path, response.status, text);
  }
  return new ExtensionApiError(path, response.status, `HTTP ${response.status}`);
}

function listingUserError(apiError: ExtensionApiError): string {
  return humanizeListingApiError({
    code: apiError.code,
    message: apiError.message,
    status: apiError.status,
  });
}

async function createInventoryLotFromRuntime(params: {
  steamAssetId: string;
  priceMinor: number;
  inventoryAssetId?: string | null;
}): Promise<{
  ok: boolean;
  lotId?: string;
  lotUrl?: string;
  listingsUrl?: string;
  error?: string;
  errorCode?: string;
}> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const priceError = validateCreateLotPriceMinor(params.priceMinor);
  if (priceError) {
    return { ok: false, error: priceError };
  }

  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return {
      ok: false,
      error: 'Подключите расширение на сайте (Account → Подключить).',
    };
  }

  const base = state.apiBaseUrl.replace(/\/$/, '');
  const siteOrigin = siteOriginFromApiBaseUrl(state.apiBaseUrl);
  const listingsUrl = siteListingsUrl(siteOrigin);
  const headers = {
    Authorization: `Bearer ${state.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let inventoryAssetId = params.inventoryAssetId?.trim() || null;

  try {
    if (!inventoryAssetId) {
      const inventoryResponse = await fetch(`${base}/inventory?forceRefresh=true`, {
        headers: {
          Authorization: headers.Authorization,
          Accept: headers.Accept,
        },
      });
      if (!inventoryResponse.ok) {
        const apiError = await readListingApiError(
          '/inventory',
          inventoryResponse,
        );
        await invalidateSessionOnAuthError(apiError);
        return {
          ok: false,
          error: listingUserError(apiError),
          errorCode: apiError.code,
        };
      }
      const inventoryBody = (await inventoryResponse.json()) as {
        assets?: Array<{ id?: string; assetExternalId?: string }>;
      };
      inventoryAssetId = findPlatformAssetIdByExternalId(
        inventoryBody.assets ?? [],
        params.steamAssetId,
      );
    }

    if (!inventoryAssetId) {
      return {
        ok: false,
        error:
          'Предмет ещё не в инвентаре площадки. Откройте «Мои продажи» на сайте и обновите инвентарь, затем повторите.',
        listingsUrl,
      };
    }

    const checkResponse = await fetch(
      `${base}/inventory/${encodeURIComponent(inventoryAssetId)}/check`,
      {
        method: 'POST',
        headers: {
          Authorization: headers.Authorization,
          Accept: headers.Accept,
        },
      },
    );
    if (!checkResponse.ok) {
      const apiError = await readListingApiError(
        `/inventory/${inventoryAssetId}/check`,
        checkResponse,
      );
      await invalidateSessionOnAuthError(apiError);
      return {
        ok: false,
        error: listingUserError(apiError),
        errorCode: apiError.code,
      };
    }

    const checkedAsset = (await checkResponse.json()) as Parameters<
      typeof evaluateCheckedInventoryAsset
    >[0];
    const eligibility = evaluateCheckedInventoryAsset(checkedAsset);
    if (!eligibility.ok) {
      return {
        ok: false,
        error: eligibility.error ?? 'Предмет не прошёл проверку перед выставкой',
        listingsUrl,
      };
    }

    const createResponse = await fetch(`${base}/lots`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inventoryAssetId,
        priceMinor: params.priceMinor,
      }),
    });
    if (!createResponse.ok) {
      const apiError = await readListingApiError('/lots', createResponse);
      await invalidateSessionOnAuthError(apiError);
      return {
        ok: false,
        error: listingUserError(apiError),
        errorCode: apiError.code,
      };
    }

    const lot = (await createResponse.json()) as { id?: string };
    if (!lot.id) {
      return { ok: false, error: 'Лот создан, но id не вернулся' };
    }

    void recordTwoMinuteFirstList().catch(() => undefined);

    return {
      ok: true,
      lotId: lot.id,
      lotUrl: siteLotUrl(siteOrigin, lot.id),
      listingsUrl,
    };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось выставить лот',
    };
  }
}

async function loadInventoryIdMap(
  base: string,
  headers: { Authorization: string; Accept: string },
  forceRefresh: boolean,
): Promise<{
  ok: boolean;
  byExternalId: Map<string, string>;
  error?: string;
}> {
  const url = forceRefresh
    ? `${base}/inventory?forceRefresh=true`
    : `${base}/inventory`;
  const inventoryResponse = await fetch(url, {
    headers: {
      Authorization: headers.Authorization,
      Accept: headers.Accept,
    },
  });
  if (!inventoryResponse.ok) {
    const apiError = await readListingApiError('/inventory', inventoryResponse);
    await invalidateSessionOnAuthError(apiError);
    return { ok: false, byExternalId: new Map(), error: listingUserError(apiError) };
  }
  const inventoryBody = (await inventoryResponse.json()) as {
    assets?: Array<{ id?: string; assetExternalId?: string }>;
  };
  const byExternalId = new Map<string, string>();
  for (const asset of inventoryBody.assets ?? []) {
    const external = asset.assetExternalId?.trim();
    const id = asset.id?.trim();
    if (external && id) {
      byExternalId.set(external, id);
    }
  }
  return { ok: true, byExternalId };
}

async function createInventoryLotsBatchFromRuntime(params: {
  priceMinor: number;
  operations: BulkSellOperation[];
}): Promise<{
  ok: boolean;
  created: Array<{ steamAssetId: string; lotId: string; lotUrl: string }>;
  failed: Array<{ steamAssetId: string; error: string }>;
  listingsUrl?: string;
  error?: string;
}> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, created: [], failed: [], error: gate.error };
  }

  const priceError = validateCreateLotPriceMinor(params.priceMinor);
  if (priceError) {
    return { ok: false, created: [], failed: [], error: priceError };
  }

  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return {
      ok: false,
      created: [],
      failed: [],
      error: 'Подключите расширение на сайте (Account → Подключить).',
    };
  }

  const base = state.apiBaseUrl.replace(/\/$/, '');
  const siteOrigin = siteOriginFromApiBaseUrl(state.apiBaseUrl);
  const listingsUrl = siteListingsUrl(siteOrigin);
  const headers = {
    Authorization: `Bearer ${state.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const created: Array<{ steamAssetId: string; lotId: string; lotUrl: string }> =
    [];
  const failed: Array<{ steamAssetId: string; error: string }> = [];

  try {
    let idMap = await loadInventoryIdMap(base, headers, true);
    if (!idMap.ok) {
      return {
        ok: false,
        created,
        failed,
        listingsUrl,
        error: idMap.error,
      };
    }

    const resolveId = (item: {
      steamAssetId: string;
      inventoryAssetId: string | null;
    }): string | null => {
      const known = item.inventoryAssetId?.trim();
      if (known) {
        return known;
      }
      return (
        idMap.byExternalId.get(item.steamAssetId) ??
        findPlatformAssetIdByExternalId(
          [...idMap.byExternalId.entries()].map(([assetExternalId, id]) => ({
            id,
            assetExternalId,
          })),
          item.steamAssetId,
        )
      );
    };

    for (const operation of params.operations) {
      if (operation.type === 'platform_bulk') {
        const ids: string[] = [];
        const steamById = new Map<string, string>();
        for (const item of operation.items) {
          const inventoryAssetId = resolveId(item);
          if (!inventoryAssetId) {
            failed.push({
              steamAssetId: item.steamAssetId,
              error:
                'Предмет ещё не в инвентаре площадки. Обновите инвентарь на сайте.',
            });
            continue;
          }
          ids.push(inventoryAssetId);
          steamById.set(inventoryAssetId, item.steamAssetId);
        }
        if (ids.length < MIN_BULK_LISTING_COUNT) {
          for (const id of ids) {
            const steamAssetId = steamById.get(id)!;
            const single = await createInventoryLotFromRuntime({
              steamAssetId,
              inventoryAssetId: id,
              priceMinor: params.priceMinor,
            });
            if (single.ok && single.lotId && single.lotUrl) {
              created.push({
                steamAssetId,
                lotId: single.lotId,
                lotUrl: single.lotUrl,
              });
            } else {
              failed.push({
                steamAssetId,
                error: single.error ?? 'Не удалось выставить',
              });
            }
          }
          continue;
        }

        const chunkIds = ids.slice(0, MAX_BULK_LISTING_COUNT);
        const bulkResponse = await fetch(`${base}/lots/bulk`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            inventoryAssetIds: chunkIds,
            priceMinor: params.priceMinor,
          }),
        });
        if (!bulkResponse.ok) {
          const apiError = await readListingApiError('/lots/bulk', bulkResponse);
          await invalidateSessionOnAuthError(apiError);
          for (const id of chunkIds) {
            failed.push({
              steamAssetId: steamById.get(id) ?? id,
              error: listingUserError(apiError),
            });
          }
          continue;
        }
        const body = (await bulkResponse.json()) as {
          lots?: Array<{
            id?: string;
            inventoryAsset?: { id?: string; assetExternalId?: string };
          }>;
        };
        const lots = body.lots ?? [];
        const claimed = new Set<string>();
        for (const lot of lots) {
          if (!lot.id) {
            continue;
          }
          const inventoryAssetId =
            lot.inventoryAsset?.id?.trim() ||
            (lot.inventoryAsset?.assetExternalId
              ? [...steamById.entries()].find(
                  ([, steamId]) =>
                    steamId === lot.inventoryAsset?.assetExternalId,
                )?.[0]
              : null);
          const steamAssetId = inventoryAssetId
            ? steamById.get(inventoryAssetId)
            : undefined;
          if (!steamAssetId || claimed.has(steamAssetId)) {
            continue;
          }
          claimed.add(steamAssetId);
          created.push({
            steamAssetId,
            lotId: lot.id,
            lotUrl: siteLotUrl(siteOrigin, lot.id),
          });
        }
        for (const id of chunkIds) {
          const steamAssetId = steamById.get(id) ?? id;
          if (claimed.has(steamAssetId)) {
            continue;
          }
          failed.push({
            steamAssetId,
            error: 'Лот в пакете не подтверждён',
          });
        }
        continue;
      }

      for (const item of operation.items) {
        const inventoryAssetId = resolveId(item);
        const single = await createInventoryLotFromRuntime({
          steamAssetId: item.steamAssetId,
          inventoryAssetId,
          priceMinor: params.priceMinor,
        });
        if (single.ok && single.lotId && single.lotUrl) {
          created.push({
            steamAssetId: item.steamAssetId,
            lotId: single.lotId,
            lotUrl: single.lotUrl,
          });
        } else {
          failed.push({
            steamAssetId: item.steamAssetId,
            error: single.error ?? 'Не удалось выставить',
          });
        }
      }
    }

    return {
      ok: created.length > 0,
      created,
      failed,
      listingsUrl,
      error:
        created.length === 0
          ? failed[0]?.error ?? 'Не удалось выставить лоты'
          : undefined,
    };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      created,
      failed,
      listingsUrl,
      error:
        error instanceof Error ? error.message : 'Не удалось выставить лоты',
    };
  }
}

async function updateInventoryLotPriceFromRuntime(params: {
  lotId: string;
  priceMinor: number;
}): Promise<{
  ok: boolean;
  lotId?: string;
  lotUrl?: string;
  priceMinor?: string;
  listingsUrl?: string;
  error?: string;
  errorCode?: string;
}> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const priceError = validateCreateLotPriceMinor(params.priceMinor);
  if (priceError) {
    return { ok: false, error: priceError };
  }
  const lotId = params.lotId.trim();
  if (!lotId) {
    return { ok: false, error: 'Не указан лот' };
  }

  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return {
      ok: false,
      error: 'Подключите расширение на сайте (Account → Подключить).',
    };
  }

  const base = state.apiBaseUrl.replace(/\/$/, '');
  const siteOrigin = siteOriginFromApiBaseUrl(state.apiBaseUrl);
  const listingsUrl = siteListingsUrl(siteOrigin);

  try {
    const response = await fetch(
      `${base}/lots/${encodeURIComponent(lotId)}/price`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceMinor: params.priceMinor }),
      },
    );
    if (!response.ok) {
      const apiError = await readListingApiError(
        `/lots/${lotId}/price`,
        response,
      );
      await invalidateSessionOnAuthError(apiError);
      return {
        ok: false,
        error: listingUserError(apiError),
        listingsUrl,
        errorCode: apiError.code,
      };
    }
    const lot = (await response.json()) as { id?: string; priceMinor?: string };
    return {
      ok: true,
      lotId: lot.id ?? lotId,
      lotUrl: siteLotUrl(siteOrigin, lot.id ?? lotId),
      priceMinor: lot.priceMinor ?? String(params.priceMinor),
      listingsUrl,
    };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      listingsUrl,
      error:
        error instanceof Error ? error.message : 'Не удалось обновить цену',
    };
  }
}

async function cancelInventoryLotFromRuntime(params: {
  lotId: string;
}): Promise<{
  ok: boolean;
  lotId?: string;
  listingsUrl?: string;
  error?: string;
  errorCode?: string;
}> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const lotId = params.lotId.trim();
  if (!lotId) {
    return { ok: false, error: 'Не указан лот' };
  }

  const state = await getSessionState();
  if (!state?.accessToken || !state.apiBaseUrl) {
    return {
      ok: false,
      error: 'Подключите расширение на сайте (Account → Подключить).',
    };
  }

  const base = state.apiBaseUrl.replace(/\/$/, '');
  const listingsUrl = siteListingsUrl(
    siteOriginFromApiBaseUrl(state.apiBaseUrl),
  );

  try {
    const response = await fetch(
      `${base}/lots/${encodeURIComponent(lotId)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    if (!response.ok) {
      const apiError = await readListingApiError(
        `/lots/${lotId}/cancel`,
        response,
      );
      await invalidateSessionOnAuthError(apiError);
      return {
        ok: false,
        error: listingUserError(apiError),
        listingsUrl,
        errorCode: apiError.code,
      };
    }
    return { ok: true, lotId, listingsUrl };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      listingsUrl,
      error:
        error instanceof Error ? error.message : 'Не удалось снять с продажи',
    };
  }
}

async function manualCreateOfferFromRuntime(orderId: string): Promise<{
  ok: boolean;
  offerId?: string;
  confirmPending?: boolean;
  siteUrl?: string;
  error?: string;
}> {
  const gate = await assertSiteMutationsAllowed();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const trimmed = orderId.trim();
  if (!trimmed) {
    return { ok: false, error: 'orderId обязателен' };
  }

  let trades: TradeVerificationResult[] = [];
  try {
    trades = await pollActiveTrades();
  } catch {
    const cache = await getActiveTradesCache();
    trades = cache?.trades ?? [];
  }

  const trade = trades.find((entry) => entry.orderId === trimmed);
  if (!trade) {
    return { ok: false, error: 'Активная сделка не найдена. Обновите список.' };
  }

  const candidate = buildManualCreateCandidate(trade);
  if (!candidate) {
    return {
      ok: false,
      error:
        'Для этой сделки нельзя собрать оффер (нужны Trade URL покупателя и asset, без уже привязанного offer).',
    };
  }

  const draftInput = buildManualCreateDraftInput(candidate);
  // Open Trade URL in a new tab so /tradeoffers stays as the console.
  const steam = new SteamCommunityClient();
  const tradeTabId = await steam.navigateToTradePage(candidate.buyerTradeUrl, {
    forceNewTab: true,
  });
  if (!tradeTabId) {
    return {
      ok: false,
      error: 'Не удалось открыть страницу обмена Steam. Попробуйте ещё раз.',
    };
  }

  const adapter = new MessageSteamOfferAdapter(steam);
  const drafted = await adapter.draftOffer({
    buyerTradeUrl: draftInput.buyerTradeUrl,
    item: draftInput.item,
    taskId: draftInput.taskId,
    note: draftInput.note,
  });
  if (!drafted.ok) {
    return { ok: false, error: drafted.message || drafted.code };
  }

  const sent = await adapter.sendOffer(drafted.draftId);
  if (!sent.ok) {
    return { ok: false, error: sent.message || sent.code };
  }

  // Best-effort: ack + try to advance an existing create_offer task to OFFER_SENT.
  try {
    const auth = await buildAuthenticatedClient();
    if (auth) {
      await auth.client.acknowledgeTrade({
        orderId: candidate.orderId,
        type: 'SELLER_ACK_SENT',
        offerId: sent.offerId,
        idempotencyKey: `ack:${candidate.orderId}:SELLER_ACK_SENT:manual`,
      });
      try {
        const tasks = await auth.client.pollTasks(10);
        const task = tasks.find((entry) => entry.orderId === candidate.orderId);
        if (task) {
          await auth.client.reportTaskProgress({
            taskId: task.id,
            phase: 'OFFER_SENT',
            idempotencyKey: `progress:${task.id}:OFFER_SENT:manual`,
            offerId: sent.offerId,
            details: {
              source: 'manual_create',
              confirmPending: Boolean(sent.confirmPending),
            },
          });
        }
      } catch {
        // Linking via task is best-effort; order page paste remains available.
      }
    }
  } catch {
    // Ack failure should not hide a successful Steam send.
  }

  await pollActiveTrades().catch(() => undefined);

  return {
    ok: true,
    offerId: sent.offerId,
    confirmPending: Boolean(sent.confirmPending),
    siteUrl: candidate.siteUrl,
  };
}

function handleTradeVerificationRuntimeMessage(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES) {
    void (async () => {
      const cache = await getActiveTradesCache();
      const siteLink = await getStoredSiteLinkSnapshot();
      sendResponse({
        ok: true,
        trades: cache?.trades ?? [],
        updatedAt: cache?.updatedAt ?? null,
        fromCache: true,
        siteLink: {
          ...siteLink,
          fromCache: true,
          cacheUpdatedAt: cache?.updatedAt ?? siteLink.cacheUpdatedAt,
        },
      });
    })();
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.REFRESH_ACTIVE_TRADES) {
    void (async () => {
      try {
        const trades = await pollActiveTrades({ force: true });
        const cache = await getActiveTradesCache();
        const siteLink = await getStoredSiteLinkSnapshot();
        sendResponse({
          ok: true,
          trades,
          fromCache: siteLink.fromCache,
          siteLink: {
            ...siteLink,
            cacheUpdatedAt: cache?.updatedAt ?? siteLink.cacheUpdatedAt,
          },
        });
      } catch (error: unknown) {
        const cache = await getActiveTradesCache();
        const siteLink = await getStoredSiteLinkSnapshot();
        sendResponse({
          ok: Boolean(cache?.trades?.length),
          trades: cache?.trades ?? [],
          fromCache: true,
          siteLink,
          error: error instanceof Error ? error.message : 'Refresh failed',
        });
      }
    })();
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE) {
    void verifyTradeFromRuntime({
      orderId: message.orderId ? String(message.orderId) : undefined,
      offerId: message.offerId ? String(message.offerId) : undefined,
      observedAssetId: message.observedAssetId
        ? String(message.observedAssetId)
        : undefined,
      observedFloatValue: message.observedFloatValue
        ? String(message.observedFloatValue)
        : undefined,
    })
      .then((trade) => sendResponse({ ok: Boolean(trade), trade }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Verify failed',
        }),
      );
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.ACK_TRADE) {
    void acknowledgeTradeFromRuntime({
      orderId: String(message.orderId ?? ''),
      ackType: message.ackType as
        | 'SELLER_ACK_SENT'
        | 'BUYER_ACK_PRE_ACCEPT'
        | 'BUYER_ACK_RECEIVED',
      offerId: message.offerId ? String(message.offerId) : undefined,
      idempotencyKey: String(message.idempotencyKey ?? ''),
    }).then(sendResponse);
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.MANUAL_CREATE_OFFER) {
    void manualCreateOfferFromRuntime(String(message.orderId ?? '')).then(
      sendResponse,
    );
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.RESOLVE_ASSET_FLOAT) {
    const assetId = message.assetId ? String(message.assetId).trim() : '';
    if (!assetId) {
      sendResponse({ ok: false, floatValue: null });
      return true;
    }
    void loadCs2InventoryFromCookies()
      .then((inventory) => {
        const item = inventory.items.find((entry) => entry.assetId === assetId);
        sendResponse({
          ok: Boolean(item?.floatValue),
          floatValue: item?.floatValue ?? null,
        });
      })
      .catch(() => sendResponse({ ok: false, floatValue: null }));
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PLATFORM_STATUS) {
    void (async () => {
      try {
        const payload = await loadInventoryPlatformStatus();
        const siteLink = await getStoredSiteLinkSnapshot();
        sendResponse({
          ok: true,
          ...payload,
          siteSafeMode: siteLink.safeMode,
          siteLink,
        });
      } catch (error: unknown) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Platform status failed',
          byAssetId: {},
          siteSafeMode: true,
        });
      }
    })();
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PRICE_HINTS) {
    const names = Array.isArray(message.marketHashNames)
      ? message.marketHashNames.map((name) => String(name))
      : [];
    const cacheOnly = message.cacheOnly !== false;
    void loadInventoryPriceHints(names, cacheOnly)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Price hints failed',
          hints: {},
        }),
      );
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PAGE_FACTS) {
    const tabId = sender.tab?.id;
    const steamIdHint =
      typeof message.steamId === 'string' ? message.steamId.trim() : null;
    if (tabId == null) {
      sendResponse({
        ok: false,
        error: 'Inventory tab not found',
        facts: [],
        source: 'empty',
      });
      return false;
    }
    void (async () => {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          args: [steamIdHint && /^\d{17}$/.test(steamIdHint) ? steamIdHint : null],
          func: loadCs2EnrichmentFactsInPageMain,
        });
        const result = injection?.result as PageEnrichmentLoadResult | undefined;
        if (!result) {
          sendResponse({
            ok: false,
            error: 'Steam page enrichment returned empty',
            facts: [],
            source: 'empty',
          });
          return;
        }
        sendResponse({
          ok: result.facts.length > 0,
          ...result,
        });
      } catch (error: unknown) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Steam page enrichment failed',
          facts: [],
          source: 'empty',
        });
      }
    })();
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.BROWSER_ASSIST_INVENTORY_SYNC) {
    void (async () => {
      try {
        const state = await getSessionState();
        if (!state?.accessToken || !state.apiBaseUrl) {
          sendResponse({ ok: false, error: 'Extension not connected' });
          return;
        }
        const steamId =
          typeof message.steamId === 'string' ? message.steamId.trim() : '';
        const assets = Array.isArray(message.assets) ? message.assets : [];
        if (!/^\d{17}$/.test(steamId) || assets.length === 0) {
          sendResponse({
            ok: false,
            error: 'Browser assist requires steamId and assets',
          });
          return;
        }
        const base = state.apiBaseUrl.replace(/\/$/, '');
        const response = await fetch(`${base}/extension/inventory/browser-assist`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            steamId,
            assets,
            complete: message.complete === true,
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          itemCount?: number;
          status?: string;
          warning?: string | null;
          message?: string;
          error?: string;
        } | null;
        if (!response.ok) {
          sendResponse({
            ok: false,
            error:
              body?.message ||
              body?.error ||
              `Browser assist failed (${response.status})`,
          });
          return;
        }
        sendResponse({
          ok: true,
          itemCount: body?.itemCount ?? assets.length,
          status: body?.status ?? null,
          warning: body?.warning ?? null,
        });
      } catch (error: unknown) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Browser assist sync failed',
        });
      }
    })();
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.CREATE_INVENTORY_LOT) {
    void createInventoryLotFromRuntime({
      steamAssetId: String(message.steamAssetId ?? ''),
      priceMinor: Number(message.priceMinor),
      inventoryAssetId: message.inventoryAssetId
        ? String(message.inventoryAssetId)
        : null,
    }).then(sendResponse);
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.CREATE_INVENTORY_LOTS_BATCH) {
    const operations = Array.isArray(message.operations)
      ? (message.operations as BulkSellOperation[])
      : [];
    void createInventoryLotsBatchFromRuntime({
      priceMinor: Number(message.priceMinor),
      operations,
    }).then(sendResponse);
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.UPDATE_INVENTORY_LOT_PRICE) {
    void updateInventoryLotPriceFromRuntime({
      lotId: String(message.lotId ?? ''),
      priceMinor: Number(message.priceMinor),
    }).then(sendResponse);
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.CANCEL_INVENTORY_LOT) {
    void cancelInventoryLotFromRuntime({
      lotId: String(message.lotId ?? ''),
    }).then(sendResponse);
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_SELLER_ONBOARDING_STATUS) {
    void loadSellerOnboardingStatus(Boolean(message.force))
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Seller onboarding status failed',
          connected: false,
          tradeUrl: null,
          tradeUrlReady: false,
          accountUrl: siteAccountUrl(null),
        }),
      );
    return true;
  }

  if (message?.type === TRADE_OFFER_INTERCEPTED_MESSAGE) {
    void recordInterceptedOffer({
      offerId: String(message.offerId ?? ''),
      confirmPending: Boolean(message.confirmPending),
      assetId: message.assetId ? String(message.assetId) : undefined,
      buyerTradeUrl: message.buyerTradeUrl
        ? String(message.buyerTradeUrl)
        : undefined,
      draftId: message.draftId ? String(message.draftId) : undefined,
    })
      .then((cached) => sendResponse({ ok: Boolean(cached), offerId: cached?.offerId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
}

export async function pollAndProcessTasks(): Promise<void> {
  if (pollInFlight) {
    return pollInFlight;
  }
  pollInFlight = pollAndProcessTasksInner().finally(() => {
    pollInFlight = null;
  });
  return pollInFlight;
}

async function pollAndProcessTasksInner(): Promise<void> {
  void pollActiveTrades().catch((error) => {
    console.warn('[rip-market] active trades poll failed', error);
  });

  if (!(await assertSessionDeviceConsistency())) {
    return;
  }
  const state = await getSessionState();
  if (!state) {
    return;
  }
  if (Date.parse(state.expiresAt) <= Date.now()) {
    await clearSessionState();
    return;
  }

  const keys = await ensureDeviceKeys();
  let client = buildClient(state, keys, keys.privateKeyJwk);
  const freshState = await ensureFreshSession(client, state);
  if (!freshState) {
    return;
  }
  client = buildClient(freshState, keys, keys.privateKeyJwk);

  let tasks;
  try {
    tasks = await client.pollTasks(10);
    await recordTaskPollSuccess();
    const cache = await getActiveTradesCache();
    await rememberSiteLink({
      paired: true,
      liveFetchOk: true,
      fromCache: false,
      cacheUpdatedAt: cache?.updatedAt ?? null,
      lastError: null,
    });
    const schedule = await syncPollSchedule({
      trades: cache?.trades ?? [],
      pendingTaskCount: tasks.length,
    });
    if (schedule.changed && schedule.mode === 'active') {
      // Mode just woke — don't wait for the next alarm tick.
      void pollActiveTrades({ force: true }).catch(() => undefined);
    }
  } catch (error) {
    await recordPollFailure(
      error instanceof Error ? error.message : 'Task poll failed',
    );
    await invalidateSessionOnAuthError(error);
    const cache = await getActiveTradesCache();
    await rememberSiteLink({
      paired: true,
      liveFetchOk: false,
      fromCache: Boolean(cache?.trades?.length),
      cacheUpdatedAt: cache?.updatedAt ?? null,
      lastError: error instanceof Error ? error.message : 'Task poll failed',
    });
    throw error;
  }

  try {
    const origin = siteOriginFromApiBaseUrl(freshState.apiBaseUrl);
    await setActiveTradeTaskAssetsCache(
      collectActiveTradeTaskAssets(tasks, origin),
    );
  } catch (error) {
    console.warn('[rip-market] failed to cache active trade-task assets', error);
  }

  const adapter = new MessageSteamOfferAdapter();
  const reporter = new HttpTaskProgressReporter(client);
  const diagReporter: TaskProgressReporter = {
    report: async (params) => {
      if (params.phase === 'OFFER_FAILED' && params.reasonCode) {
        const healthCode = offerErrorToSessionHealthCode(params.reasonCode);
        if (healthCode) {
          await saveLastSessionDiag(
            buildSessionHealth({
              code: healthCode,
              messageOverride:
                params.details &&
                typeof params.details === 'object' &&
                typeof (params.details as { message?: unknown }).message ===
                  'string'
                  ? String((params.details as { message: string }).message)
                  : undefined,
            }),
          );
          if (healthCode === 'INVENTORY_RATE_LIMITED') {
            await recordRateLimitedHit();
          }
        }
      }
      return reporter.report(params);
    },
  };
  const orchestrator = new CreateOfferOrchestrator(adapter, diagReporter);

  const skipPhases = new Set([
    'OFFER_SENT',
    'OFFER_FAILED',
    'CONFIRM_PENDING',
  ]);

  for (const task of tasks) {
    if (processingTasks.has(task.id)) {
      continue;
    }
    if (task.executionPhase && skipPhases.has(task.executionPhase)) {
      continue;
    }
    processingTasks.add(task.id);
    try {
      await applyTaskUiTradeFlowFlag(task.payload.uiTradeFlow);
      await orchestrator.processTask(task);
    } catch (error) {
      console.error('[rip-market] task failed', task.id, error);
      if (isExtensionAuthError(error)) {
        await invalidateSessionOnAuthError(error, {
          taskId: task.id,
          reporter: diagReporter,
        });
        return;
      }
      try {
        await diagReporter.report({
          taskId: task.id,
          phase: 'OFFER_FAILED',
          idempotencyKey: `progress:${task.id}:OFFER_FAILED:unhandled`,
          reasonCode: 'OFFER_SEND_FAILED',
          details: {
            message: error instanceof Error ? error.message : 'Unhandled error',
          },
        });
      } catch (reportError) {
        await invalidateSessionOnAuthError(reportError, {
          taskId: task.id,
          reporter: diagReporter,
        });
        if (!isExtensionAuthError(reportError)) {
          console.error('[rip-market] failed to report error', task.id, reportError);
        }
      }
    } finally {
      await setTaskUiTradeFlowOverride(undefined);
      processingTasks.delete(task.id);
    }
  }
}

export async function sendHeartbeat(): Promise<void> {
  if (!(await assertSessionDeviceConsistency())) {
    return;
  }
  const state = await getSessionState();
  if (!state) {
    return;
  }
  const keys = await ensureDeviceKeys();
  const client = buildClient(state, keys, keys.privateKeyJwk);
  try {
    const hint = await client.heartbeat();
    // I5: refresh public flags so inventory/guided/quiet kills apply without re-pair.
    void syncUiTradeFlowFromAuthConfig(state.apiBaseUrl).catch((error) => {
      console.warn('[rip-market] extension flags sync failed', error);
    });
    const cache = await getActiveTradesCache();
    const schedule = await syncPollSchedule({
      trades: cache?.trades ?? [],
      backendHasPendingWork: hint.hasPendingTask === true,
      backendHasActiveDeal: hint.hasActiveDeal === true,
    });
    if (
      schedule.changed &&
      schedule.mode === 'active' &&
      (hint.hasPendingTask || hint.hasActiveDeal)
    ) {
      void pollAndProcessTasks();
      void pollActiveTrades({ force: true });
    }
  } catch (error) {
    await invalidateSessionOnAuthError(error);
  }
}

function respondWithSessionHealth(
  message: { expectedSteamId?: unknown; probeInventory?: unknown },
  sendResponse: (response: unknown) => void,
): void {
  void probeSessionHealth({
    expectedSteamId: message.expectedSteamId
      ? String(message.expectedSteamId)
      : undefined,
    probeInventory: message.probeInventory !== false,
  })
    .then(async (health) => {
      if (health.code === 'INVENTORY_RATE_LIMITED') {
        await recordRateLimitedHit();
      }
      sendResponse({ ok: true, health });
    })
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      }),
    );
}

function respondWithOpsHealth(
  message: {
    probeInventory?: unknown;
    health?: SessionHealth | null;
  },
  sendResponse: (response: unknown) => void,
): void {
  void (async () => {
    const status = await getExtensionStatus();
    const health =
      message.health && typeof message.health === 'object'
        ? (message.health as SessionHealth)
        : await probeSessionHealth({
            probeInventory: message.probeInventory !== false,
          });
    if (health.code === 'INVENTORY_RATE_LIMITED') {
      await recordRateLimitedHit();
    }
    const manifest = chrome.runtime.getManifest();
    const ops = await buildOpsHealthSnapshot({
      connected: Boolean(status.connected),
      health,
      extensionVersion: manifest.version ?? '0',
    });
    sendResponse({ ok: true, ...ops });
  })().catch((error: unknown) =>
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Ops health failed',
    }),
  );
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    void pollAndProcessTasks();
  }
  if (alarm.name === ACTIVE_TRADES_ALARM) {
    void pollActiveTrades();
  }
  if (alarm.name === HEARTBEAT_ALARM) {
    // Chrome may clamp sub-minute alarms; heartbeat doubles as a poll tick for p95 latency.
    void sendHeartbeat();
    void pollAndProcessTasks();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void handleQuietNotificationClick(notificationId);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  void handleQuietNotificationButton(notificationId, buttonIndex);
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'RIP_MARKET_PAIR') {
    void pairExtension({
      userJwt: String(message.userJwt ?? ''),
      apiBaseUrl: message.apiBaseUrl ? String(message.apiBaseUrl) : undefined,
      locale: message.locale ? String(message.locale) : undefined,
    }).then(sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_SET_LOCALE') {
    void (async () => {
      const { normalizeExtensionLocale, setStoredExtensionLocale } =
        await import('../shared/extension-i18n.js');
      const locale = normalizeExtensionLocale(message.locale);
      await setStoredExtensionLocale(locale);
      sendResponse({ ok: true, locale });
    })();
    return true;
  }
  if (message?.type === 'RIP_MARKET_STATUS') {
    void getExtensionStatus().then(sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_DISCONNECT') {
    void disconnectExtension().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'RIP_MARKET_POLL_NOW') {
    void pollAndProcessTasks().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'RIP_MARKET_SESSION_HEALTH') {
    respondWithSessionHealth(message, sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_OPS_HEALTH') {
    respondWithOpsHealth(message, sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_DEBUG_PACK') {
    void buildExtensionDebugPack({
      expectedSteamId: message.expectedSteamId
        ? String(message.expectedSteamId)
        : undefined,
      probeInventory: message.probeInventory !== false,
    })
      .then((result) =>
        sendResponse({
          ok: true,
          pack: result.pack,
          supportBridge: result.supportBridge,
          clipboardText: result.clipboardText,
          supportUrl: result.supportUrl,
        }),
      )
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Debug pack failed',
        }),
      );
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (handleTradeVerificationRuntimeMessage(message, sender, sendResponse)) {
    return true;
  }
  if (message?.type === 'RIP_MARKET_STATUS') {
    void getExtensionStatus().then(sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_DISCONNECT') {
    void disconnectExtension().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'RIP_MARKET_POLL_NOW') {
    void pollAndProcessTasks().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'RIP_MARKET_SESSION_HEALTH') {
    respondWithSessionHealth(message, sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_OPS_HEALTH') {
    respondWithOpsHealth(message, sendResponse);
    return true;
  }
  if (message?.type === 'RIP_MARKET_DEBUG_PACK') {
    void buildExtensionDebugPack({
      expectedSteamId: message.expectedSteamId
        ? String(message.expectedSteamId)
        : undefined,
      probeInventory: message.probeInventory !== false,
    })
      .then((result) =>
        sendResponse({
          ok: true,
          pack: result.pack,
          supportBridge: result.supportBridge,
          clipboardText: result.clipboardText,
          supportUrl: result.supportUrl,
        }),
      )
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Debug pack failed',
        }),
      );
    return true;
  }
  if (message?.type === 'RIP_MARKET_QUIET_NOTIFY_GET') {
    void loadQuietNotifyState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Quiet notify get failed',
        }),
      );
    return true;
  }
  if (message?.type === 'RIP_MARKET_QUIET_NOTIFY_SET') {
    void setQuietNotificationsEnabled(Boolean(message.enabled))
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Quiet notify set failed',
        }),
      );
    return true;
  }
  if (message?.type === 'RIP_MARKET_QUIET_NOTIFY_UNMUTE') {
    void unmuteQuietNotifyDeal(String(message.orderId ?? ''))
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Quiet notify unmute failed',
        }),
      );
    return true;
  }
  return false;
});

void getSessionState().then((state) => {
  if (state) {
    void scheduleAlarms().then(() => {
      void pollAndProcessTasks();
      void pollActiveTrades();
    });
  }
});
