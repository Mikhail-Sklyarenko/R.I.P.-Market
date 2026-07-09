import {
  TRADE_OFFER_BRIDGE_SOURCE,
  TRADE_OFFER_PAGE_SOURCE,
  STEAM_BRIDGE_MESSAGE,
  type RunAutofillBridgeRequest,
  type RunAutofillPageResponse,
  type TradeOfferDraftPayload,
  type TradeOfferSendResult,
} from '../shared/trade-offer-messages.js';
import { parseSteamSendResponse } from '../shared/trade-offer-send-errors.js';

const CS2_APP_ID = 730;
const CS2_CONTEXT = 2;
const DEFAULT_TRADE_NOTE = 'R.I.P Market trade';
const PAGE_SCRIPT_ID = 'rip-market-trade-offer-ui';

type SteamSendResponse = {
  tradeofferid?: string | number;
  needs_mobile_confirmation?: boolean;
  strError?: string;
};

type SteamFindAssetResult = {
  appid: number;
  contextid: string;
  assetid: string;
  element?: HTMLElement;
};

type SteamUserYou = {
  findAsset: (
    appId: number,
    contextId: string,
    assetId: string,
  ) => SteamFindAssetResult | null;
};

type AjaxCompleteHandler = (
  event: unknown,
  xhr: { responseText?: string },
  settings: { url?: string },
) => void;

type SteamJQuery = {
  (target: Document | string): {
    click: () => void;
    ajaxComplete: (handler: AjaxCompleteHandler) => void;
    off: (event: string, handler: AjaxCompleteHandler) => void;
  };
};

type WindowWithSteam = Window &
  typeof globalThis & {
    UserYou?: SteamUserYou;
    g_ActiveInventory?: unknown;
    g_ActiveAppId?: number;
    MoveItemToTrade?: (element: HTMLElement) => void;
    $J?: SteamJQuery;
    jQuery?: SteamJQuery;
    ConfirmTradeOffer?: () => void;
    __ripMarketTradeOffer?: {
      runAutofillFlow: (draft: TradeOfferDraftPayload) => Promise<TradeOfferSendResult>;
    };
  };

function getSteamWindow(): WindowWithSteam {
  return window as WindowWithSteam;
}

function clickElement(selector: string): void {
  const win = getSteamWindow();
  const jquery = win.$J ?? win.jQuery;
  if (jquery) {
    jquery(selector).click();
    return;
  }
  document.querySelector<HTMLElement>(selector)?.click();
}

export function prepareYourInventory(): void {
  clickElement('#inventory_select_your_inventory');
}

export function ensureCs2InventoryActive(): void {
  const win = getSteamWindow();
  if (win.g_ActiveAppId === CS2_APP_ID) {
    return;
  }

  const selectors = [
    '#appselect_you_app_730',
    '#appselect_you_app_730_option',
    'div[id^="appselect_you_app_730"]',
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.click();
      return;
    }
  }
}

export async function waitForTradePageReady(
  timeoutMs = 30_000,
  assetId?: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    prepareYourInventory();
    ensureCs2InventoryActive();

    const win = getSteamWindow();
    if (assetId && findAssetElement(CS2_APP_ID, CS2_CONTEXT, assetId)) {
      return;
    }
    if (assetId && isTradeItemVisibleInDom(assetId)) {
      return;
    }
    if (win.UserYou && win.g_ActiveInventory) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Trade page not ready — inventory item not loaded');
}

function findAssetElement(
  appId: number,
  contextId: string | number,
  assetId: string,
): HTMLElement | null {
  const win = getSteamWindow();
  const found = win.UserYou?.findAsset(appId, String(contextId), String(assetId));
  if (found?.element instanceof HTMLElement) {
    return found.element;
  }
  return null;
}

function isTradeItemVisibleInDom(assetId: string): boolean {
  return Boolean(
    document.getElementById(`asset_730_2_${assetId}`) ??
      document.querySelector(`[data-assetid="${assetId}"]`),
  );
}

function selectItemViaDom(
  appId: number,
  contextId: string | number,
  assetId: string,
): boolean {
  const elementIds = [
    `asset_${appId}_${contextId}_${assetId}`,
    `asset_${appId}_2_${assetId}`,
  ];
  for (const elementId of elementIds) {
    const element = document.getElementById(elementId);
    if (element) {
      element.click();
      return true;
    }
  }

  const byData = document.querySelector(
    `[data-assetid="${assetId}"], [data-id="${assetId}"]`,
  );
  if (byData instanceof HTMLElement) {
    byData.click();
    return true;
  }

  return false;
}

export function isItemInTradeOffer(assetId: string): boolean {
  const selectors = [
    `#trade_slot_drag_target .item[data-assetid="${assetId}"]`,
    `#your_slots .item[data-assetid="${assetId}"]`,
    `#trade_items .item[id$="_${assetId}"]`,
    `.tradeoffer_items_ctn .item[id$="_${assetId}"]`,
  ];
  for (const selector of selectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  const confirmButton = document.querySelector<HTMLElement>('#trade_confirmbtn');
  return Boolean(
    confirmButton &&
      confirmButton.style.display !== 'none' &&
      !confirmButton.classList.contains('btn_disabled'),
  );
}

export function selectItemForTrade(
  appId = CS2_APP_ID,
  contextId = CS2_CONTEXT,
  assetId: string,
): void {
  prepareYourInventory();
  ensureCs2InventoryActive();

  const win = getSteamWindow();
  const element = findAssetElement(appId, contextId, assetId);
  if (element && typeof win.MoveItemToTrade === 'function') {
    win.MoveItemToTrade(element);
    return;
  }

  if (selectItemViaDom(appId, contextId, assetId)) {
    return;
  }

  throw new Error(`Item ${assetId} not found in trade inventory`);
}

async function selectItemForTradeWithRetry(
  assetId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = `Item ${assetId} not found in trade inventory`;

  while (Date.now() < deadline) {
    try {
      selectItemForTrade(CS2_APP_ID, CS2_CONTEXT, assetId);
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (isItemInTradeOffer(assetId)) {
        return;
      }
      lastError = `Item ${assetId} was clicked but not added to trade offer`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(lastError);
}

export function setTradeNote(text: string): void {
  const noteInput = document.querySelector<HTMLTextAreaElement>('#trade_offer_note');
  if (!noteInput) {
    throw new Error('Trade note field not found');
  }
  noteInput.value = text;
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickReadyIfPresent(): void {
  const readyButton = document.querySelector<HTMLElement>('#trade_confirmbtn');
  if (readyButton && readyButton.style.display !== 'none') {
    readyButton.click();
  }
}

export function submitTradeOffer(): void {
  const win = getSteamWindow();
  clickReadyIfPresent();

  if (typeof win.ConfirmTradeOffer === 'function') {
    win.ConfirmTradeOffer();
    return;
  }

  const confirmButton = document.querySelector<HTMLElement>('#trade_confirm_ok_btn');
  if (confirmButton) {
    confirmButton.click();
    return;
  }

  const sendButton = document.querySelector<HTMLElement>('#trade_confirmbtn');
  if (sendButton) {
    sendButton.click();
    return;
  }

  throw new Error('Send button not available on trade page');
}

export function installSendInterceptor(timeoutMs = 30_000): Promise<SteamSendResponse> {
  return new Promise((resolve, reject) => {
    const win = getSteamWindow();
    const jquery = win.$J ?? win.jQuery;
    if (!jquery) {
      reject(new Error('Steam jQuery ($J) not available'));
      return;
    }
    const boundJquery = jquery;

    const timeout = window.setTimeout(() => {
      boundJquery(document).off('ajaxComplete', onAjaxComplete);
      reject(new Error('Send interceptor timeout'));
    }, timeoutMs);

    function onAjaxComplete(
      _event: unknown,
      xhr: { responseText?: string },
      settings: { url?: string },
    ): void {
      const url = settings.url ?? '';
      if (!url.includes('tradeoffer/new/send')) {
        return;
      }

      window.clearTimeout(timeout);
      boundJquery(document).off('ajaxComplete', onAjaxComplete);

      const responseText = xhr.responseText ?? '';
      if (!responseText || responseText === 'null') {
        reject(new Error('Steam returned empty send response'));
        return;
      }

      try {
        resolve(JSON.parse(responseText) as SteamSendResponse);
      } catch {
        reject(new Error(`Steam returned invalid send JSON: ${responseText.slice(0, 200)}`));
      }
    }

    boundJquery(document).ajaxComplete(onAjaxComplete);
  });
}

export async function runAutofillFlow(
  draft: TradeOfferDraftPayload,
): Promise<TradeOfferSendResult> {
  if (!window.location.pathname.includes('/tradeoffer/new')) {
    return { ok: false, error: 'Not on Steam trade offer page' };
  }

  try {
    await waitForTradePageReady(30_000, draft.item.assetId);
    await selectItemForTradeWithRetry(draft.item.assetId);
    setTradeNote(draft.note?.trim() || DEFAULT_TRADE_NOTE);

    const interceptor = installSendInterceptor();
    submitTradeOffer();
    const steamResponse = await interceptor;
    return parseSteamSendResponse(steamResponse);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Trade offer send failed',
    };
  }
}

function postPageResponse(requestId: string, result: TradeOfferSendResult): void {
  const message: RunAutofillPageResponse = {
    source: TRADE_OFFER_PAGE_SOURCE,
    requestId,
    result,
  };
  window.postMessage(message, '*');
}

function handleBridgeMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  const data = event.data as RunAutofillBridgeRequest | undefined;
  if (!data || data.source !== TRADE_OFFER_BRIDGE_SOURCE) {
    return;
  }
  if (data.type !== STEAM_BRIDGE_MESSAGE.RUN_AUTOFILL_FLOW) {
    return;
  }

  void runAutofillFlow(data.payload)
    .then((result) => postPageResponse(data.requestId, result))
    .catch((error: unknown) => {
      postPageResponse(data.requestId, {
        ok: false,
        error: error instanceof Error ? error.message : 'Autofill flow failed',
      });
    });
}

function bootstrapPageScript(): void {
  if (document.getElementById(PAGE_SCRIPT_ID)) {
    getSteamWindow().__ripMarketTradeOffer = { runAutofillFlow };
    return;
  }

  const marker = document.createElement('meta');
  marker.id = PAGE_SCRIPT_ID;
  marker.setAttribute('data-rip-market', 'trade-offer-ui');
  document.documentElement.appendChild(marker);

  getSteamWindow().__ripMarketTradeOffer = { runAutofillFlow };
  document.documentElement.setAttribute('data-rip-market-trade-offer-ui', 'ready');
  window.addEventListener('message', handleBridgeMessage);
}

bootstrapPageScript();

/*
Manual QA on https://steamcommunity.com/tradeoffer/new/?partner=...&token=...
  await window.__ripMarketTradeOffer.runAutofillFlow({
    buyerTradeUrl: location.href,
    item: { assetId: '<your-asset-id>' },
    note: 'R.I.P Market trade',
  });
*/
