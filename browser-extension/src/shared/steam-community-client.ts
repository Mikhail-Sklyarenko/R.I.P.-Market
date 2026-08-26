import { fetchInventoryViaWebApi } from './steam-api-inventory.js';
import { loadCs2InventoryFromCookies } from './steam-cookie-client.js';
import { isDirectTradeApiEnabled, shouldUseUiTradeFlow } from './extension-flags.js';
import {
  emptyInventoryLoadResult,
  type InventoryLoadResult,
} from './inventory-load-result.js';
import { loadInventoryViaPageScript } from './steam-page-inventory.js';
import { resolveLoggedInSteamId } from './steam-session.js';
import { getSteamWebApiKey } from './steam-web-api-settings.js';
import { navigateTab, waitForTabLoad, waitForTabUrl } from './steam-tab-utils.js';
import {
  sendTradeOfferViaPageScript,
  type TradeOfferDraft,
} from './steam-trade-offer.js';
import type { TradeOfferDraftPayload } from './trade-offer-messages.js';
import {
  isTabOnBuyerTradeUrl,
  runTradeOfferAutofillInMainWorld,
  type TradeOfferProgressHooks,
} from './trade-offer-ui-runner.js';

export type { TradeOfferProgressHooks };

const STEAM_TAB_URL = 'https://steamcommunity.com/my/inventory/#730_2';
const TRADE_PAGE_SETTLE_MS = 800;

function mergeInventoryFailures(results: InventoryLoadResult[]): InventoryLoadResult {
  if (results.length === 0) {
    return emptyInventoryLoadResult('unknown', 'Seller inventory is not loaded');
  }
  const priority: Array<NonNullable<InventoryLoadResult['failReason']>> = [
    'private',
    'rate_limited',
    'not_logged_in',
    'unknown',
  ];
  for (const reason of priority) {
    const hit = results.find((entry) => entry.failReason === reason || (reason === 'rate_limited' && entry.rateLimited));
    if (hit) {
      return {
        items: [],
        rateLimited: hit.rateLimited || reason === 'rate_limited',
        failReason: hit.failReason ?? reason,
        errorMessage: hit.errorMessage,
      };
    }
  }
  return results[results.length - 1] ?? emptyInventoryLoadResult('unknown');
}

function isUsableSteamTab(url = ''): boolean {
  if (!url.includes('steamcommunity.com')) {
    return false;
  }
  if (url.includes('/market') || url.includes('/store')) {
    return false;
  }
  return true;
}

function tabPriority(url: string | undefined): number {
  if (!url) return 0;
  if (!isUsableSteamTab(url)) return 0;
  if (url.includes('/tradeoffer/new')) return 5;
  if (url.includes('/inventory')) return 4;
  if (url.includes('/tradeoffer')) return 3;
  if (url.includes('/profiles/') || url.includes('/id/')) return 2;
  if (url.includes('/openid/')) return 0;
  return 1;
}

type SendTradeOfferResult =
  | { ok: true; offerId: string; confirmPending: boolean }
  | { ok: false; error: string; strError?: string };

export class SteamCommunityClient {
  private cachedTabId: number | null = null;

  async resolveSessionSteamId(): Promise<string | null> {
    return resolveLoggedInSteamId();
  }

  private async openSteamTab(): Promise<number | null> {
    const created = await chrome.tabs.create({
      url: STEAM_TAB_URL,
      active: false,
    });
    if (!created.id) {
      return null;
    }
    await waitForTabLoad(created.id);
    this.cachedTabId = created.id;
    return created.id;
  }

  async ensureSteamTab(): Promise<number | null> {
    if (this.cachedTabId) {
      try {
        await chrome.tabs.get(this.cachedTabId);
        return this.cachedTabId;
      } catch {
        this.cachedTabId = null;
      }
    }

    const tabs = await chrome.tabs.query({ url: 'https://steamcommunity.com/*' });
    const sorted = [...tabs].sort(
      (a, b) => tabPriority(b.url) - tabPriority(a.url),
    );
    const inventoryTab = sorted.find(
      (tab) => tab.id && tab.url?.includes('/inventory'),
    );
    if (inventoryTab?.id) {
      this.cachedTabId = inventoryTab.id;
      return inventoryTab.id;
    }

    const anyTab = sorted.find((tab) => tab.id && tabPriority(tab.url) > 0);
    if (anyTab?.id) {
      this.cachedTabId = anyTab.id;
      return anyTab.id;
    }

    return this.openSteamTab();
  }

  async navigateToTradePage(
    buyerTradeUrl: string,
    options?: { forceNewTab?: boolean },
  ): Promise<number | null> {
    if (options?.forceNewTab) {
      const created = await chrome.tabs.create({
        url: buyerTradeUrl,
        active: true,
      });
      if (!created.id) {
        return null;
      }
      await waitForTabLoad(created.id);
      const ready = await waitForTabUrl(created.id, buyerTradeUrl);
      if (!ready) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, TRADE_PAGE_SETTLE_MS));
      this.cachedTabId = created.id;
      return created.id;
    }

    const tabs = await chrome.tabs.query({ url: 'https://steamcommunity.com/*' });
    const existingTradeTab = tabs.find(
      (tab) => tab.id && isTabOnBuyerTradeUrl(tab.url, buyerTradeUrl),
    );
    if (existingTradeTab?.id) {
      this.cachedTabId = existingTradeTab.id;
      await chrome.tabs.update(existingTradeTab.id, { active: true });
      return existingTradeTab.id;
    }

    let tabId = await this.ensureSteamTab();
    if (!tabId) {
      return null;
    }

    const currentTab = await chrome.tabs.get(tabId).catch(() => null);
    if (currentTab?.url && !isUsableSteamTab(currentTab.url)) {
      tabId = await this.openSteamTab();
      if (!tabId) {
        return null;
      }
    }

    await navigateTab(tabId, buyerTradeUrl, { active: true });
    const ready = await waitForTabUrl(tabId, buyerTradeUrl);
    if (!ready) {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, TRADE_PAGE_SETTLE_MS));
    this.cachedTabId = tabId;
    return tabId;
  }

  async loadInventory(steamId: string): Promise<InventoryLoadResult> {
    const failures: InventoryLoadResult[] = [];
    try {
      const tabId = await this.ensureSteamTab();
      if (tabId) {
        const fromPage = await loadInventoryViaPageScript(tabId, steamId);
        if (fromPage.items.length > 0) {
          return fromPage;
        }
        failures.push(fromPage);
      }

      const fromCookies = await loadCs2InventoryFromCookies(steamId);
      if (fromCookies.items.length > 0) {
        return fromCookies;
      }
      failures.push(fromCookies);

      if (tabId) {
        const retryPage = await loadInventoryViaPageScript(tabId, steamId);
        if (retryPage.items.length > 0) {
          return retryPage;
        }
        failures.push(retryPage);
      }

      const apiKey = await getSteamWebApiKey();
      if (apiKey) {
        const fromWebApi = await fetchInventoryViaWebApi(steamId, apiKey);
        if (fromWebApi.length > 0) {
          return { items: fromWebApi, rateLimited: false, failReason: null };
        }
      }
    } catch (error) {
      console.warn(
        '[rip-market] loadInventory failed',
        error instanceof Error ? error.message : error,
      );
      return emptyInventoryLoadResult(
        'unknown',
        error instanceof Error ? error.message : 'Inventory load failed',
      );
    }

    return mergeInventoryFailures(failures);
  }

  async sendTradeOffer(
    draft: TradeOfferDraft,
    progress?: TradeOfferProgressHooks,
  ): Promise<SendTradeOfferResult> {
    try {
      if (await isDirectTradeApiEnabled()) {
        const tabId = await this.ensureSteamTab();
        if (!tabId) {
          return { ok: false, error: 'Steam tab unavailable' };
        }
        const apiResult = await sendTradeOfferViaPageScript(tabId, draft);
        if (apiResult.ok) {
          await progress?.onItemSelected?.();
          await progress?.onOfferSubmitted?.();
        }
        return apiResult;
      }

      if (await shouldUseUiTradeFlow()) {
        const tabId = await this.navigateToTradePage(draft.buyerTradeUrl);
        if (!tabId) {
          return { ok: false, error: 'Failed to open Steam trade page' };
        }
        return await this.sendTradeOfferViaUi(tabId, draft, progress);
      }

      const tabId = await this.ensureSteamTab();
      if (!tabId) {
        return { ok: false, error: 'Steam tab unavailable' };
      }
      const apiResult = await sendTradeOfferViaPageScript(tabId, draft);
      if (
        apiResult.ok ||
        !/empty response|null response|HTTP 400|invalid json/i.test(
          apiResult.error,
        )
      ) {
        if (apiResult.ok) {
          await progress?.onItemSelected?.();
          await progress?.onOfferSubmitted?.();
        }
        return apiResult;
      }

      // Classic /tradeoffer/new/send often returns HTTP 400 empty for Trade Protected
      // inventories — fall back to page autofill so the item is actually selected.
      const tradeTabId = await this.navigateToTradePage(draft.buyerTradeUrl);
      if (!tradeTabId) {
        return {
          ok: false,
          error: `${apiResult.error} (UI fallback failed: trade page unavailable)`,
        };
      }
      return await this.sendTradeOfferViaUi(tradeTabId, draft, progress);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Trade page navigation failed',
      };
    }
  }

  async sendTradeOfferViaUi(
    tabId: number,
    draft: TradeOfferDraft,
    progress?: TradeOfferProgressHooks,
  ): Promise<SendTradeOfferResult> {
    const payload: TradeOfferDraftPayload = {
      buyerTradeUrl: draft.buyerTradeUrl,
      item: draft.item,
      note: draft.note?.trim() || 'R.I.P Market trade',
    };

    try {
      const result = await runTradeOfferAutofillInMainWorld(
        tabId,
        payload,
        progress,
      );
      if (result.ok) {
        return {
          ok: true,
          offerId: result.offerId,
          confirmPending: result.confirmPending,
        };
      }

      return {
        ok: false,
        error: result.error,
        strError: result.strError,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Trade page UI flow failed: ${error.message}`
            : 'Trade page UI flow failed',
      };
    }
  }
}

export type { TradeOfferDraft };
