import {
  CreateOfferOrchestrator,
  ExtensionApiClient,
  HttpTaskProgressReporter,
  isExtensionAuthError,
  type TradeVerificationResult,
} from '@rip-market/extension-orchestrator';
import { MessageSteamOfferAdapter } from '../adapters/message-steam-offer-adapter.js';
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
  syncUiTradeFlowFromAuthConfig,
} from '../shared/extension-flags.js';
import {
  countActionableTrades,
  getActiveTradesCache,
  isTradeAcknowledgmentEnabled,
  setActiveTradesCache,
} from '../shared/active-trades-cache.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';
import { loadCs2InventoryFromCookies } from '../shared/steam-cookie-client.js';

const POLL_ALARM = 'rip-market-poll-tasks';
const ACTIVE_TRADES_ALARM = 'rip-market-poll-active-trades';
const HEARTBEAT_ALARM = 'rip-market-heartbeat';
const processingTasks = new Set<string>();
let pollInFlight: Promise<void> | null = null;

async function invalidateSessionOnAuthError(error: unknown): Promise<void> {
  if (!isExtensionAuthError(error)) {
    return;
  }
  console.warn('[rip-market] extension session invalid — clearing local session');
  await clearSessionState();
  await chrome.alarms.clearAll();
}

export async function pairExtension(params: {
  userJwt: string;
  apiBaseUrl?: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  try {
    await disconnectExtension();
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

export async function scheduleAlarms(): Promise<void> {
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.05 });
  await chrome.alarms.create(ACTIVE_TRADES_ALARM, { periodInMinutes: 0.5 });
  await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
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

export async function pollActiveTrades(): Promise<TradeVerificationResult[]> {
  if (!(await isTradeAcknowledgmentEnabled())) {
    await setActiveTradesCache([]);
    await chrome.action.setBadgeText({ text: '' });
    return [];
  }

  const auth = await buildAuthenticatedClient();
  if (!auth) {
    return [];
  }

  try {
    const trades = await auth.client.listActiveTrades(10);
    await setActiveTradesCache(trades);
    const actionable = countActionableTrades(trades);
    await chrome.action.setBadgeText({
      text: actionable > 0 ? String(actionable) : '',
    });
    await chrome.action.setBadgeBackgroundColor({ color: '#5b8def' });
    return trades;
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    throw error;
  }
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
    await pollActiveTrades();
    return { ok: true };
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Acknowledgment failed',
    };
  }
}

function handleTradeVerificationRuntimeMessage(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message?.type === TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES) {
    void getActiveTradesCache().then((cache) => {
      sendResponse({
        ok: true,
        trades: cache?.trades ?? [],
        updatedAt: cache?.updatedAt ?? null,
      });
    });
    return true;
  }

  if (message?.type === TRADE_VERIFICATION_RUNTIME.REFRESH_ACTIVE_TRADES) {
    void pollActiveTrades()
      .then((trades) => sendResponse({ ok: true, trades }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Refresh failed',
        }),
      );
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
  } catch (error) {
    await invalidateSessionOnAuthError(error);
    throw error;
  }
  const adapter = new MessageSteamOfferAdapter();
  const reporter = new HttpTaskProgressReporter(client);
  const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

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
        await invalidateSessionOnAuthError(error);
        return;
      }
      try {
        await reporter.report({
          taskId: task.id,
          phase: 'OFFER_FAILED',
          idempotencyKey: `progress:${task.id}:OFFER_FAILED:unhandled`,
          reasonCode: 'OFFER_SEND_FAILED',
          details: {
            message: error instanceof Error ? error.message : 'Unhandled error',
          },
        });
      } catch (reportError) {
        await invalidateSessionOnAuthError(reportError);
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
    await client.heartbeat();
  } catch (error) {
    await invalidateSessionOnAuthError(error);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    void pollAndProcessTasks();
  }
  if (alarm.name === ACTIVE_TRADES_ALARM) {
    void pollActiveTrades();
  }
  if (alarm.name === HEARTBEAT_ALARM) {
    void sendHeartbeat();
  }
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'RIP_MARKET_PAIR') {
    void pairExtension({
      userJwt: String(message.userJwt ?? ''),
      apiBaseUrl: message.apiBaseUrl ? String(message.apiBaseUrl) : undefined,
    }).then(sendResponse);
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
  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (handleTradeVerificationRuntimeMessage(message, sendResponse)) {
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
