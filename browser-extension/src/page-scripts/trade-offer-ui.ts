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
    SelectInventory?: (appId: number, contextId: number) => void;
    MoveItemToTrade?: (element: HTMLElement) => void;
    $J?: SteamJQuery;
    jQuery?: SteamJQuery;
    ConfirmTradeOffer?: () => void;
    __ripMarketTradeOffer?: {
      runAutofillFlow: (draft: TradeOfferDraftPayload) => Promise<TradeOfferSendResult>;
      prepareAndSelectItem: (
        draft: TradeOfferDraftPayload,
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      submitAndWaitForSend: () => Promise<TradeOfferSendResult>;
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

function readActiveAppId(win: WindowWithSteam): number | null {
  if (typeof win.g_ActiveAppId === 'number' && Number.isFinite(win.g_ActiveAppId)) {
    return win.g_ActiveAppId;
  }
  const inventory = win.g_ActiveInventory as
    | { appid?: number; m_appid?: number }
    | undefined;
  const raw = Number(inventory?.appid ?? inventory?.m_appid);
  return Number.isFinite(raw) ? raw : null;
}

/**
 * Steam's inventory switcher. Current tradeoffer UI rarely has
 * #appselect_you_app_730 — SelectInventory(730, 2) does.
 */
export function requestCs2Inventory(): void {
  const win = getSteamWindow();
  if (typeof win.SelectInventory === 'function') {
    try {
      win.SelectInventory(CS2_APP_ID, CS2_CONTEXT);
    } catch {
      // Applist not ready yet.
    }
  }

  clickElement('#inventory_select_your_inventory');
  for (const selector of [
    '#appselect_you',
    '#appselect',
    '#appselect_activeapp',
    '.appselect_activeapp',
  ]) {
    clickElement(selector);
  }

  const optionIds = [
    'appselect_option_you_730_2',
    'appselect_option_you_730_16',
    'appselect_option_you_730',
    'appselect_you_app_730',
  ];
  for (const id of optionIds) {
    const option = document.getElementById(id);
    if (option) {
      option.click();
      return;
    }
  }

  const labeled = Array.from(
    document.querySelectorAll<HTMLElement>(
      '#appselect_applist .appselect_option, .appselect_option',
    ),
  ).find((el) => {
    if (el.id.includes('_them_')) {
      return false;
    }
    const text = (el.textContent ?? '').toLowerCase();
    return (
      text.includes('counter-strike') ||
      /\bcs2\b/.test(text) ||
      el.id.includes('730')
    );
  });
  labeled?.click();
}

export function ensureCs2InventoryActive(): void {
  requestCs2Inventory();
}

export function isCs2TradeInventoryReady(assetId?: string): boolean {
  if (assetId && findAssetElement(CS2_APP_ID, CS2_CONTEXT, assetId)) {
    return true;
  }
  if (assetId && isTradeItemVisibleInDom(assetId)) {
    return true;
  }

  const win = getSteamWindow();
  const inventoryBox =
    document.getElementById('inventory_730_2') ??
    document.getElementById('inventory_730_16') ??
    document.querySelector<HTMLElement>('#inventories [id^="inventory_730"]');
  if (inventoryBox && inventoryBox.style.display !== 'none') {
    const hasCells = Boolean(
      inventoryBox.querySelector('.item, .itemHolder .item, .itemHolder'),
    );
    if (hasCells) {
      return true;
    }
  }

  return (
    readActiveAppId(win) === CS2_APP_ID &&
    Boolean(win.UserYou) &&
    Boolean(win.g_ActiveInventory)
  );
}

export async function waitForTradePageReady(
  timeoutMs = 15_000,
  assetId?: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    prepareYourInventory();
    requestCs2Inventory();
    if (isCs2TradeInventoryReady(assetId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    'CS2 inventory did not load. Select Counter-Strike 2 in the inventory list, then retry.',
  );
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
      document.getElementById(`item730_2_${assetId}`) ??
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
    `item${appId}_${contextId}_${assetId}`,
    `item${appId}_2_${assetId}`,
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
    `#your_slots .item[id$="_${assetId}"]`,
    `#your_slots #item730_2_${assetId}`,
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
  requestCs2Inventory();

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

export async function prepareAndSelectItem(
  draft: TradeOfferDraftPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!window.location.pathname.includes('/tradeoffer/new')) {
    return { ok: false, error: 'Not on Steam trade offer page' };
  }

  try {
    await waitForTradePageReady(30_000, draft.item.assetId);
    await selectItemForTradeWithRetry(draft.item.assetId);
    setTradeNote(draft.note?.trim() || DEFAULT_TRADE_NOTE);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Trade offer prepare failed',
    };
  }
}

export async function submitAndWaitForSend(): Promise<TradeOfferSendResult> {
  try {
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

export async function runAutofillFlow(
  draft: TradeOfferDraftPayload,
): Promise<TradeOfferSendResult> {
  const prepared = await prepareAndSelectItem(draft);
  if (!prepared.ok) {
    return prepared;
  }
  return submitAndWaitForSend();
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
  const api = {
    runAutofillFlow,
    prepareAndSelectItem,
    submitAndWaitForSend,
  };

  if (document.getElementById(PAGE_SCRIPT_ID)) {
    getSteamWindow().__ripMarketTradeOffer = api;
    return;
  }

  const marker = document.createElement('meta');
  marker.id = PAGE_SCRIPT_ID;
  marker.setAttribute('data-rip-market', 'trade-offer-ui');
  document.documentElement.appendChild(marker);

  getSteamWindow().__ripMarketTradeOffer = api;
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
