import type { TradeOfferDraftPayload, TradeOfferSendResult } from '../page-scripts/trade-offer-ui.js';

type WindowWithRIP = Window & {
  __ripMarketTradeOffer?: {
    runAutofillFlow: (draft: TradeOfferDraftPayload) => Promise<TradeOfferSendResult>;
  };
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

export function isTabOnBuyerTradeUrl(tabUrl: string | undefined, buyerTradeUrl: string): boolean {
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
 */
export async function runTradeOfferAutofillInMainWorld(
  tabId: number,
  draft: TradeOfferDraftPayload,
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
      error: error instanceof Error ? error.message : 'Failed to inject trade page script',
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 300));

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (draftArg: TradeOfferDraftPayload) => {
      const ripApi = (window as unknown as WindowWithRIP).__ripMarketTradeOffer;
      if (!ripApi?.runAutofillFlow) {
        return Promise.resolve({
          ok: false,
          error: 'Trade page script not ready — reload trade page',
        } satisfies TradeOfferSendResult);
      }
      return ripApi.runAutofillFlow(draftArg).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Autofill failed',
      }));
    },
    args: [draft],
  });

  if (!result) {
    return { ok: false, error: 'Autofill returned no result' };
  }

  return result as TradeOfferSendResult;
}
