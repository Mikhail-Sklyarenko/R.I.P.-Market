/**
 * E3 runtime: persist quiet-notify state + show Chrome notifications.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  applyQuietNotifyPlan,
  defaultQuietNotifyState,
  muteQuietNotifyOrder,
  parseQuietNotifyState,
  planQuietNotifications,
  pruneQuietNotifyFingerprints,
  setQuietNotifyEnabled,
  unmuteQuietNotifyOrder,
  QUIET_NOTIFY_STORAGE_KEY,
  type QuietNotifyPlan,
  type QuietNotifyState,
} from './quiet-notifications.js';

const CLICK_URL_PREFIX = 'rip-quiet-click:';

export async function loadQuietNotifyState(): Promise<QuietNotifyState> {
  try {
    const stored = await chrome.storage.local.get(QUIET_NOTIFY_STORAGE_KEY);
    return parseQuietNotifyState(stored[QUIET_NOTIFY_STORAGE_KEY]);
  } catch {
    return defaultQuietNotifyState();
  }
}

export async function saveQuietNotifyState(
  state: QuietNotifyState,
): Promise<void> {
  await chrome.storage.local.set({ [QUIET_NOTIFY_STORAGE_KEY]: state });
}

function iconUrl(): string {
  return chrome.runtime.getURL('icons/icon128.png');
}

async function createChromeNotification(params: {
  notificationId: string;
  title: string;
  message: string;
  clickUrl: string;
  muteOrderId?: string | null;
}): Promise<void> {
  const options = {
    type: 'basic' as const,
    iconUrl: iconUrl(),
    title: params.title,
    message: params.message,
    priority: 1,
    requireInteraction: params.muteOrderId ? true : false,
    ...(params.muteOrderId
      ? {
          buttons: [
            { title: 'Открыть' },
            { title: 'Скрыть на сделку' },
          ],
        }
      : {}),
  };

  // Store click target for onClicked / button handlers.
  await chrome.storage.session.set({
    [`${CLICK_URL_PREFIX}${params.notificationId}`]: {
      clickUrl: params.clickUrl,
      muteOrderId: params.muteOrderId ?? null,
    },
  });

  await chrome.notifications.create(params.notificationId, options);
}

export async function dispatchQuietNotifyPlan(
  plan: QuietNotifyPlan,
): Promise<void> {
  if (plan.type === 'none') {
    return;
  }

  if (plan.type === 'single') {
    await createChromeNotification({
      notificationId: plan.notificationId,
      title: plan.event.title,
      message: plan.event.message,
      clickUrl: plan.event.clickUrl,
      muteOrderId: plan.event.orderId,
    });
    return;
  }

  await createChromeNotification({
    notificationId: plan.notificationId,
    title: plan.title,
    message: plan.message,
    clickUrl: plan.clickUrl,
    muteOrderId: null,
  });
}

/**
 * After active-trades poll: prune, plan, show, persist fingerprints.
 */
export async function processQuietNotifications(
  trades: TradeVerificationResult[],
): Promise<QuietNotifyPlan> {
  let state = await loadQuietNotifyState();
  state = pruneQuietNotifyFingerprints(
    state,
    trades.map((trade) => trade.orderId),
  );

  const plan = planQuietNotifications({ trades, state });
  if (plan.type === 'none') {
    await saveQuietNotifyState(state);
    return plan;
  }

  try {
    await dispatchQuietNotifyPlan(plan);
    state = applyQuietNotifyPlan(state, plan);
  } catch (error) {
    console.warn('[rip-market] quiet notification failed', error);
  }

  await saveQuietNotifyState(state);
  return plan;
}

export async function handleQuietNotificationClick(
  notificationId: string,
): Promise<void> {
  const key = `${CLICK_URL_PREFIX}${notificationId}`;
  const stored = await chrome.storage.session.get(key);
  const payload = stored[key] as
    | { clickUrl?: string; muteOrderId?: string | null }
    | undefined;
  const url = payload?.clickUrl;
  if (url) {
    await chrome.tabs.create({ url });
  } else {
    await chrome.action.openPopup().catch(() => {
      // openPopup may fail if no user gesture — ignore.
    });
  }
  await chrome.notifications.clear(notificationId);
  await chrome.storage.session.remove(key);
}

export async function handleQuietNotificationButton(
  notificationId: string,
  buttonIndex: number,
): Promise<void> {
  const key = `${CLICK_URL_PREFIX}${notificationId}`;
  const stored = await chrome.storage.session.get(key);
  const payload = stored[key] as
    | { clickUrl?: string; muteOrderId?: string | null }
    | undefined;

  if (buttonIndex === 0) {
    await handleQuietNotificationClick(notificationId);
    return;
  }

  if (buttonIndex === 1 && payload?.muteOrderId) {
    const state = await loadQuietNotifyState();
    await saveQuietNotifyState(muteQuietNotifyOrder(state, payload.muteOrderId));
  }

  await chrome.notifications.clear(notificationId);
  await chrome.storage.session.remove(key);
}

export async function setQuietNotificationsEnabled(
  enabled: boolean,
): Promise<QuietNotifyState> {
  const state = setQuietNotifyEnabled(await loadQuietNotifyState(), enabled);
  await saveQuietNotifyState(state);
  return state;
}

export async function unmuteQuietNotifyDeal(
  orderId: string,
): Promise<QuietNotifyState> {
  const state = unmuteQuietNotifyOrder(await loadQuietNotifyState(), orderId);
  await saveQuietNotifyState(state);
  return state;
}
