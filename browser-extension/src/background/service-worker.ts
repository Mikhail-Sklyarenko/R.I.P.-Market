import {
  CreateOfferOrchestrator,
  ExtensionApiClient,
  HttpTaskProgressReporter,
  isExtensionAuthError,
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

const POLL_ALARM = 'rip-market-poll-tasks';
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
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.25 });
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
    void scheduleAlarms().then(() => pollAndProcessTasks());
  }
});
