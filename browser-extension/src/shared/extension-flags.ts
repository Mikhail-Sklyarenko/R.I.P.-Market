export const USE_DIRECT_TRADE_API_KEY = 'USE_DIRECT_TRADE_API';
/** Emergency override only — forces legacy Steam API POST instead of UI autofill. */
export const UI_TRADE_FLOW_ENABLED_KEY = 'extensionUiTradeFlowEnabled';
const TASK_UI_TRADE_FLOW_SESSION_KEY = 'rip:taskUiTradeFlow';

type AuthConfigResponse = {
  extension?: {
    extensionUiTradeFlowEnabled?: boolean;
  };
};

export async function isDirectTradeApiEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(USE_DIRECT_TRADE_API_KEY);
  return stored[USE_DIRECT_TRADE_API_KEY] === true;
}

export async function syncUiTradeFlowFromAuthConfig(
  apiBaseUrl: string,
): Promise<boolean> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/auth/config`);
  if (!response.ok) {
    return false;
  }
  const config = (await response.json()) as AuthConfigResponse;
  const enabled = config.extension?.extensionUiTradeFlowEnabled === true;
  await chrome.storage.local.set({ [UI_TRADE_FLOW_ENABLED_KEY]: enabled });
  return enabled;
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
