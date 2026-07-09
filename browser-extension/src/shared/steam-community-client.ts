import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';
import { fetchInventoryViaWebApi } from './steam-api-inventory.js';
import { loadCs2InventoryFromCookies } from './steam-cookie-client.js';
import { isDirectTradeApiEnabled, shouldUseUiTradeFlow } from './extension-flags.js';
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
} from './trade-offer-ui-runner.js';

const STEAM_TAB_URL = 'https://steamcommunity.com/my/inventory/#730_2';
const TRADE_PAGE_SETTLE_MS = 3000;

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

  async navigateToTradePage(buyerTradeUrl: string): Promise<number | null> {
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

  async loadInventory(steamId: string): Promise<SteamInventoryItem[]> {
    try {
      const tabId = await this.ensureSteamTab();
      if (tabId) {
        const fromPage = await loadInventoryViaPageScript(tabId, steamId);
        if (fromPage.items.length > 0) {
          return fromPage.items;
        }
      }

      const fromCookies = await loadCs2InventoryFromCookies(steamId);
      if (fromCookies.items.length > 0) {
        return fromCookies.items;
      }

      if (tabId) {
        const retryPage = await loadInventoryViaPageScript(tabId, steamId);
        if (retryPage.items.length > 0) {
          return retryPage.items;
        }
      }

      const apiKey = await getSteamWebApiKey();
      if (apiKey) {
        const fromWebApi = await fetchInventoryViaWebApi(steamId, apiKey);
        if (fromWebApi.length > 0) {
          return fromWebApi;
        }
      }
    } catch (error) {
      console.warn(
        '[rip-market] loadInventory failed',
        error instanceof Error ? error.message : error,
      );
    }

    return [];
  }

  async sendTradeOffer(draft: TradeOfferDraft): Promise<SendTradeOfferResult> {
    try {
      if (await isDirectTradeApiEnabled()) {
        const tabId = await this.ensureSteamTab();
        if (!tabId) {
          return { ok: false, error: 'Steam tab unavailable' };
        }
        return await sendTradeOfferViaPageScript(tabId, draft);
      }

      if (await shouldUseUiTradeFlow()) {
        const tabId = await this.navigateToTradePage(draft.buyerTradeUrl);
        if (!tabId) {
          return { ok: false, error: 'Failed to open Steam trade page' };
        }
        return await this.sendTradeOfferViaUi(tabId, draft);
      }

      const tabId = await this.ensureSteamTab();
      if (!tabId) {
        return { ok: false, error: 'Steam tab unavailable' };
      }
      return await sendTradeOfferViaPageScript(tabId, draft);
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
  ): Promise<SendTradeOfferResult> {
    const payload: TradeOfferDraftPayload = {
      buyerTradeUrl: draft.buyerTradeUrl,
      item: draft.item,
      note: 'R.I.P Market trade',
    };

    try {
      const result = await runTradeOfferAutofillInMainWorld(tabId, payload);
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
