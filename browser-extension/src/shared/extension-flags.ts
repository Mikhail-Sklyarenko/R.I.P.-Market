import {
  GUIDED_BUYER_ENABLED_KEY,
  INVENTORY_LAYER_ENABLED_KEY,
  QUIET_NOTIFICATIONS_ENABLED_KEY,
  TRADE_ACK_ENABLED_KEY,
  UI_TRADE_FLOW_ENABLED_KEY,
  USE_DIRECT_TRADE_API_KEY,
} from './active-trades-cache.js';

const TASK_UI_TRADE_FLOW_SESSION_KEY = 'rip:taskUiTradeFlow';

type AuthConfigResponse = {
  extension?: {
    extensionUiTradeFlowEnabled?: boolean;
    extensionTradeAcknowledgmentEnabled?: boolean;
    extensionInventoryLayerEnabled?: boolean;
    extensionGuidedBuyerEnabled?: boolean;
    extensionQuietNotificationsEnabled?: boolean;
  };
};

/**
 * I5 kill-safe: missing storage key = enabled (legacy UX) until first config sync.
 * Explicit `false` from server disables the surface.
 */
function isRemoteFlagOn(stored: unknown): boolean {
  return stored !== false;
}

export async function isDirectTradeApiEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(USE_DIRECT_TRADE_API_KEY);
  return stored[USE_DIRECT_TRADE_API_KEY] === true;
}

/**
 * Pulls public extension flags from `/auth/config` into chrome.storage.local.
 * Called on pair and periodically (heartbeat) so kills propagate without re-pair.
 */
export async function syncUiTradeFlowFromAuthConfig(
  apiBaseUrl: string,
): Promise<boolean> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/auth/config`);
  if (!response.ok) {
    return false;
  }
  const config = (await response.json()) as AuthConfigResponse;
  const uiEnabled = config.extension?.extensionUiTradeFlowEnabled === true;
  const ackEnabled =
    config.extension?.extensionTradeAcknowledgmentEnabled === true;
  // I5: unset / missing on server → treat as on (matches backend !== 'false').
  const inventoryLayerEnabled =
    config.extension?.extensionInventoryLayerEnabled !== false;
  const guidedBuyerEnabled =
    config.extension?.extensionGuidedBuyerEnabled !== false;
  const quietNotificationsEnabled =
    config.extension?.extensionQuietNotificationsEnabled !== false;
  await chrome.storage.local.set({
    [UI_TRADE_FLOW_ENABLED_KEY]: uiEnabled,
    [TRADE_ACK_ENABLED_KEY]: ackEnabled,
    [INVENTORY_LAYER_ENABLED_KEY]: inventoryLayerEnabled,
    [GUIDED_BUYER_ENABLED_KEY]: guidedBuyerEnabled,
    [QUIET_NOTIFICATIONS_ENABLED_KEY]: quietNotificationsEnabled,
  });
  return uiEnabled;
}

/** Alias — same sync covers UI trade + I5 UX flags. */
export const syncExtensionFlagsFromAuthConfig = syncUiTradeFlowFromAuthConfig;

export async function isExtensionInventoryLayerEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(INVENTORY_LAYER_ENABLED_KEY);
  return isRemoteFlagOn(stored[INVENTORY_LAYER_ENABLED_KEY]);
}

export async function isExtensionGuidedBuyerEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(GUIDED_BUYER_ENABLED_KEY);
  return isRemoteFlagOn(stored[GUIDED_BUYER_ENABLED_KEY]);
}

export async function isExtensionQuietNotificationsEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(QUIET_NOTIFICATIONS_ENABLED_KEY);
  return isRemoteFlagOn(stored[QUIET_NOTIFICATIONS_ENABLED_KEY]);
}

export async function setTaskUiTradeFlowOverride(
  enabled: boolean | undefined,
): Promise<void> {
  if (enabled === undefined) {
    await chrome.storage.session.remove(TASK_UI_TRADE_FLOW_SESSION_KEY);
    return;
  }
  await chrome.storage.session.set({ [TASK_UI_TRADE_FLOW_SESSION_KEY]: enabled });
}

export async function shouldUseUiTradeFlow(): Promise<boolean> {
  if (await isDirectTradeApiEnabled()) {
    return false;
  }

  const session = await chrome.storage.session.get(TASK_UI_TRADE_FLOW_SESSION_KEY);
  if (session[TASK_UI_TRADE_FLOW_SESSION_KEY] === true) {
    return true;
  }

  const local = await chrome.storage.local.get(UI_TRADE_FLOW_ENABLED_KEY);
  return local[UI_TRADE_FLOW_ENABLED_KEY] === true;
}

export async function applyTaskUiTradeFlowFlag(
  taskUiTradeFlow?: boolean,
): Promise<void> {
  await setTaskUiTradeFlowOverride(taskUiTradeFlow === true ? true : undefined);
}

export {
  USE_DIRECT_TRADE_API_KEY,
  UI_TRADE_FLOW_ENABLED_KEY,
  INVENTORY_LAYER_ENABLED_KEY,
  GUIDED_BUYER_ENABLED_KEY,
  QUIET_NOTIFICATIONS_ENABLED_KEY,
};
