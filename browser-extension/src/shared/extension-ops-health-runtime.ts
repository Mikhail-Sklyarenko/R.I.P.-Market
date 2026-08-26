/**
 * E4 runtime: persist poll/rate-limit timestamps for popup ops health.
 */
import {
  buildOpsHealthView,
  defaultOpsHealthPollState,
  EXTENSION_UPDATE_URL,
  isRateLimitActive,
  markActiveTradesPollOk,
  markPollError,
  markRateLimited,
  markTaskPollOk,
  OPS_HEALTH_STORAGE_KEY,
  parseOpsHealthPollState,
  type OpsHealthPollState,
  type OpsHealthSnapshot,
  type OpsHealthView,
} from './extension-ops-health.js';
import type { SessionHealth } from './session-health.js';

export async function loadOpsHealthPollState(): Promise<OpsHealthPollState> {
  try {
    const stored = await chrome.storage.session.get(OPS_HEALTH_STORAGE_KEY);
    return parseOpsHealthPollState(stored[OPS_HEALTH_STORAGE_KEY]);
  } catch {
    return defaultOpsHealthPollState();
  }
}

export async function saveOpsHealthPollState(
  state: OpsHealthPollState,
): Promise<void> {
  await chrome.storage.session.set({ [OPS_HEALTH_STORAGE_KEY]: state });
}

export async function recordTaskPollSuccess(): Promise<void> {
  const next = markTaskPollOk(await loadOpsHealthPollState());
  await saveOpsHealthPollState(next);
}

export async function recordActiveTradesPollSuccess(): Promise<void> {
  const next = markActiveTradesPollOk(await loadOpsHealthPollState());
  await saveOpsHealthPollState(next);
}

export async function recordPollFailure(message: string): Promise<void> {
  const next = markPollError(await loadOpsHealthPollState(), message);
  await saveOpsHealthPollState(next);
}

export async function recordRateLimitedHit(): Promise<void> {
  const next = markRateLimited(await loadOpsHealthPollState());
  await saveOpsHealthPollState(next);
}

export async function buildOpsHealthSnapshot(params: {
  connected: boolean;
  health: SessionHealth | null;
  extensionVersion: string;
}): Promise<{ snapshot: OpsHealthSnapshot; view: OpsHealthView }> {
  const poll = await loadOpsHealthPollState();
  const healthRateLimited = params.health?.code === 'INVENTORY_RATE_LIMITED';
  const rateLimited = isRateLimitActive({
    healthRateLimited,
    lastRateLimitedAt: poll.lastRateLimitedAt,
  });
  const snapshot: OpsHealthSnapshot = {
    poll,
    rateLimited,
    rateLimitCheckedAt: params.health?.checkedAt ?? poll.lastRateLimitedAt,
    rateLimitMessage: rateLimited
      ? params.health?.code === 'INVENTORY_RATE_LIMITED'
        ? params.health.message
        : 'Steam временно ограничил запросы (429). Подождите 1–2 минуты.'
      : null,
    extensionVersion: params.extensionVersion,
    updateUrl: EXTENSION_UPDATE_URL,
    connected: params.connected,
  };
  return {
    snapshot,
    view: buildOpsHealthView({ snapshot }),
  };
}
