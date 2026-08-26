import type {
  TradeOfferDraftPayload,
  TradeOfferSendResult,
} from './trade-offer-messages.js';

type WindowWithRIP = Window & {
  __ripMarketTradeOffer?: {
    runAutofillFlow: (draft: TradeOfferDraftPayload) => Promise<TradeOfferSendResult>;
    prepareAndSelectItem: (
      draft: TradeOfferDraftPayload,
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    submitAndWaitForSend: () => Promise<TradeOfferSendResult>;
  };
  __ripMarketPendingSend?: Promise<TradeOfferSendResult>;
};

export type TradeOfferProgressHooks = {
  onItemSelected?: () => void | Promise<void>;
  onOfferSubmitted?: () => void | Promise<void>;
};

export function tradeOfferUrlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const partner = parsed.searchParams.get('partner');
    const token = parsed.searchParams.get('token');
    if (!partner || !token) {
      return null;
    }
    return `${partner}:${token}`;
  } catch {
    return null;
  }
}

export function isTabOnBuyerTradeUrl(
  tabUrl: string | undefined,
  buyerTradeUrl: string,
): boolean {
  if (!tabUrl) {
    return false;
  }
  const tabKey = tradeOfferUrlKey(tabUrl);
  const buyerKey = tradeOfferUrlKey(buyerTradeUrl);
  return Boolean(tabKey && buyerKey && tabKey === buyerKey);
}

function isTradeOfferNewPage(url: string | undefined): boolean {
  return Boolean(url?.includes('/tradeoffer/new'));
}

/**
 * Runs trade-offer autofill in the page MAIN world via chrome.scripting.executeScript.
 * Navigation to the buyer trade URL must happen before calling this.
 *
 * Progress hooks fire between select and submit so the platform sees live phases
 * while Steam is still processing the send.
 */
export async function runTradeOfferAutofillInMainWorld(
  tabId: number,
  draft: TradeOfferDraftPayload,
  hooks?: TradeOfferProgressHooks,
): Promise<TradeOfferSendResult> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) {
    return { ok: false, error: 'Steam tab URL unavailable' };
  }
  if (!isTradeOfferNewPage(tab.url)) {
    return {
      ok: false,
      error: `Trade page not open (current tab: ${tab.url})`,
    };
  }
  if (!isTabOnBuyerTradeUrl(tab.url, draft.buyerTradeUrl)) {
    return {
      ok: false,
      error: 'Steam tab is on a different trade offer URL',
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['page-scripts/trade-offer-ui.js'],
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to inject trade page script',
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 300));

  const [{ result: prepared }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (draftArg: TradeOfferDraftPayload) => {
      const ripApi = (window as unknown as WindowWithRIP).__ripMarketTradeOffer;
      if (!ripApi?.prepareAndSelectItem) {
        return Promise.resolve({
          ok: false as const,
          error: 'Trade page script not ready — reload trade page',
        });
      }
      return ripApi.prepareAndSelectItem(draftArg);
    },
    args: [draft],
  });

  if (!prepared) {
    return { ok: false, error: 'Autofill prepare returned no result' };
  }
  if (prepared.ok === false) {
    return { ok: false, error: prepared.error };
  }

  await hooks?.onItemSelected?.();

  const [{ result: started }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const win = window as unknown as WindowWithRIP;
      const ripApi = win.__ripMarketTradeOffer;
      if (!ripApi?.submitAndWaitForSend) {
        return {
          ok: false as const,
          error: 'Trade page script missing submit step — reload trade page',
        };
      }
      win.__ripMarketPendingSend = ripApi.submitAndWaitForSend();
      return { ok: true as const };
    },
  });

  if (!started || started.ok === false) {
    return {
      ok: false,
      error:
        started && 'error' in started
          ? started.error
          : 'Failed to start trade offer submit',
    };
  }

  await hooks?.onOfferSubmitted?.();

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const win = window as unknown as WindowWithRIP;
      const pending = win.__ripMarketPendingSend;
      if (!pending) {
        return Promise.resolve({
          ok: false as const,
          error: 'Pending Steam send result missing',
        } satisfies TradeOfferSendResult);
      }
      return pending.finally(() => {
        delete win.__ripMarketPendingSend;
      });
    },
  });

  if (!result) {
    return { ok: false, error: 'Autofill returned no result' };
  }

  return result as TradeOfferSendResult;
}
