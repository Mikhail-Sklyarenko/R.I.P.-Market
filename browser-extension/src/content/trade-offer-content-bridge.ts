import {
  TRADE_OFFER_BRIDGE_SOURCE,
  TRADE_OFFER_PAGE_SOURCE,
  STEAM_BRIDGE_MESSAGE,
  type RunAutofillPageResponse,
  type SteamBridgeRuntimeRequest,
  type SteamBridgeRuntimeResponse,
  type TradeOfferDraftPayload,
  type TradeOfferSendResult,
} from '../shared/trade-offer-messages.js';
import {
  recordInterceptedOffer,
  TRADE_OFFER_INTERCEPTED_MESSAGE,
} from '../shared/trade-offer-sent-cache.js';

const PAGE_SCRIPT_PATH = 'page-scripts/trade-offer-ui.js';
const PAGE_SCRIPT_MARKER_ID = 'rip-market-trade-offer-ui';
const PAGE_SCRIPT_READY_ATTR = 'data-rip-market-trade-offer-ui';

let pageScriptInjection: Promise<void> | null = null;

async function waitForPageScriptReady(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      document.documentElement.getAttribute(PAGE_SCRIPT_READY_ATTR) === 'ready'
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Page script not ready');
}

function injectPageScript(): Promise<void> {
  if (pageScriptInjection) {
    return pageScriptInjection;
  }

  if (document.documentElement.getAttribute(PAGE_SCRIPT_READY_ATTR) === 'ready') {
    return Promise.resolve();
  }

  pageScriptInjection = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(PAGE_SCRIPT_PATH);
    script.onload = () => {
      void waitForPageScriptReady()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          pageScriptInjection = null;
        });
    };
    script.onerror = () => {
      pageScriptInjection = null;
      reject(new Error('Failed to load trade page script'));
    };
    document.documentElement.appendChild(script);
  });

  return pageScriptInjection;
}

function notifyInterceptedOffer(
  payload: TradeOfferDraftPayload,
  result: TradeOfferSendResult,
): void {
  if (!result.ok || !result.offerId) {
    return;
  }
  void chrome.runtime
    .sendMessage({
      type: TRADE_OFFER_INTERCEPTED_MESSAGE,
      offerId: result.offerId,
      confirmPending: result.confirmPending,
      assetId: payload.item.assetId,
      buyerTradeUrl: payload.buyerTradeUrl,
    })
    .catch(() => {
      // Service worker may be asleep; adapter still receives the page result.
    });
  void recordInterceptedOffer({
    offerId: result.offerId,
    confirmPending: result.confirmPending,
    assetId: payload.item.assetId,
    buyerTradeUrl: payload.buyerTradeUrl,
  });
}

function runAutofillViaPageScript(
  payload: TradeOfferDraftPayload,
  timeoutMs = 45_000,
): Promise<SteamBridgeRuntimeResponse> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onPageMessage);
      resolve({
        ok: false,
        message: 'Page script autofill timed out',
      });
    }, timeoutMs);

    function onPageMessage(event: MessageEvent): void {
      if (event.source !== window) {
        return;
      }
      const data = event.data as RunAutofillPageResponse | undefined;
      if (!data || data.source !== TRADE_OFFER_PAGE_SOURCE || data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', onPageMessage);
      if (data.result.ok) {
        notifyInterceptedOffer(payload, data.result);
      }
      resolve({ ok: true, data: data.result });
    }

    window.addEventListener('message', onPageMessage);
    window.postMessage(
      {
        source: TRADE_OFFER_BRIDGE_SOURCE,
        type: STEAM_BRIDGE_MESSAGE.RUN_AUTOFILL_FLOW,
        requestId,
        payload,
      },
      '*',
    );
  });
}

export async function handleSteamBridgeRuntimeMessage(
  message: SteamBridgeRuntimeRequest,
): Promise<SteamBridgeRuntimeResponse> {
  if (message.type === STEAM_BRIDGE_MESSAGE.RUN_AUTOFILL_FLOW) {
    await injectPageScript();
    return runAutofillViaPageScript(message.payload);
  }

  return { ok: false, message: 'Unknown command' };
}

if (window.location.pathname.includes('/tradeoffer/')) {
  void injectPageScript().catch(() => undefined);
}
