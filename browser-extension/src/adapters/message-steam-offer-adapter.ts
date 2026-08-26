import type {
  DraftOfferInput,
  DraftOfferResult,
  SendOfferHooks,
  SendOfferResult,
  SellerInventoryLoadResult,
} from '@rip-market/extension-orchestrator';
import type { SteamOfferAdapter } from '@rip-market/extension-orchestrator';
import { OfferErrorCode } from '@rip-market/extension-orchestrator';
import {
  SteamCommunityClient,
  type TradeOfferDraft,
  type TradeOfferProgressHooks,
} from '../shared/steam-community-client.js';
import { inventoryFailToOfferError } from '../shared/inventory-load-result.js';
import { mapSteamSendError } from '../shared/trade-offer-send-errors.js';
import {
  cacheSentOffer,
  clearSendInflight,
  getSendInflight,
  markSendInflight,
  resolvePriorSuccessfulSend,
} from '../shared/trade-offer-sent-cache.js';

function draftStorageKey(draftId: string): string {
  return `rip:draft:${draftId}`;
}

async function replayCachedSuccess(
  cached: {
    offerId: string;
    confirmPending: boolean;
    assetId?: string;
    marketHashName?: string | null;
    floatValue?: string | null;
  },
  hooks?: SendOfferHooks,
): Promise<SendOfferResult> {
  await hooks?.onItemSelected?.({
    assetId: cached.assetId ?? cached.offerId,
    marketHashName: cached.marketHashName ?? null,
    floatValue: cached.floatValue ?? null,
  });
  await hooks?.onOfferSubmitted?.();
  return {
    ok: true,
    offerId: cached.offerId,
    confirmPending: cached.confirmPending,
  };
}

export class MessageSteamOfferAdapter implements SteamOfferAdapter {
  constructor(private readonly steam = new SteamCommunityClient()) {}

  async resolveSessionSteamId(): Promise<string | null> {
    return this.steam.resolveSessionSteamId();
  }

  async loadSellerInventory(
    sellerSteamId?: string | null,
  ): Promise<SellerInventoryLoadResult> {
    const steamId = sellerSteamId ?? (await this.steam.resolveSessionSteamId());
    if (!steamId) {
      return {
        items: [],
        errorCode: OfferErrorCode.STEAM_COOKIE_EXPIRED,
        errorMessage: 'Seller is not logged into Steam in this browser',
      };
    }
    const loaded = await this.steam.loadInventory(steamId);
    if (loaded.items.length > 0) {
      return { items: loaded.items };
    }
    const mapped = inventoryFailToOfferError(loaded);
    if (mapped) {
      return {
        items: [],
        errorCode: mapped.code,
        errorMessage: mapped.message,
      };
    }
    return {
      items: [],
      errorCode: OfferErrorCode.INVENTORY_NOT_LOADED,
      errorMessage: loaded.errorMessage ?? 'Seller inventory is not loaded',
    };
  }

  async warmTradePage(buyerTradeUrl: string): Promise<boolean> {
    const tabId = await this.steam.navigateToTradePage(buyerTradeUrl);
    return tabId !== null;
  }

  async draftOffer(input: DraftOfferInput): Promise<DraftOfferResult> {
    const draftId = input.taskId
      ? `draft-${input.taskId}`
      : `draft-${input.item.assetId}`;
    const draft: TradeOfferDraft = {
      buyerTradeUrl: input.buyerTradeUrl,
      item: input.item,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };

    const tabId = await this.steam.navigateToTradePage(input.buyerTradeUrl);
    if (!tabId) {
      return {
        ok: false,
        code: OfferErrorCode.STEAM_UNAVAILABLE,
        message: 'Steam tab unavailable for trade page',
      };
    }

    await chrome.storage.session.set({ [draftStorageKey(draftId)]: draft });
    return { ok: true, draftId };
  }

  async sendOffer(draftId: string, hooks?: SendOfferHooks): Promise<SendOfferResult> {
    const stored = await chrome.storage.session.get(draftStorageKey(draftId));
    const draft = stored[draftStorageKey(draftId)] as TradeOfferDraft | undefined;
    const assetId = draft?.item.assetId;

    const prior = await resolvePriorSuccessfulSend({ draftId, assetId });
    if (prior) {
      return replayCachedSuccess(prior, hooks);
    }

    if (!draft) {
      return {
        ok: false,
        code: OfferErrorCode.OFFER_DRAFT_FAILED,
        message: 'Draft not found — retry from inventory',
      };
    }

    const inflight = await getSendInflight(draftId);
    if (inflight) {
      const recoveredDuringInflight = await resolvePriorSuccessfulSend({
        draftId,
        assetId: draft.item.assetId,
      });
      if (recoveredDuringInflight) {
        return replayCachedSuccess(recoveredDuringInflight, hooks);
      }
      return {
        ok: false,
        code: OfferErrorCode.STEAM_UNAVAILABLE,
        message:
          'Trade offer send already in progress — wait for Steam / Guard, then retry',
      };
    }

    await markSendInflight({
      draftId,
      assetId: draft.item.assetId,
    });

    let midFlowHooksFired = false;
    const progressHooks: TradeOfferProgressHooks = {
      onItemSelected: async () => {
        midFlowHooksFired = true;
        await hooks?.onItemSelected?.({
          assetId: draft.item.assetId,
          marketHashName: draft.item.marketHashName ?? null,
          floatValue: draft.item.floatValue ?? null,
        });
      },
      onOfferSubmitted: async () => {
        midFlowHooksFired = true;
        await hooks?.onOfferSubmitted?.();
      },
    };

    let result: Awaited<ReturnType<SteamCommunityClient['sendTradeOffer']>>;
    try {
      result = await this.steam.sendTradeOffer(draft, progressHooks);
    } catch (error) {
      const recovered = await resolvePriorSuccessfulSend({
        draftId,
        assetId: draft.item.assetId,
      });
      if (recovered) {
        return replayCachedSuccess(recovered, hooks);
      }
      await clearSendInflight(draftId);
      return {
        ok: false,
        code: OfferErrorCode.OFFER_SEND_FAILED,
        message: error instanceof Error ? error.message : 'Trade offer send failed',
      };
    }

    if (!result.ok) {
      const recovered = await resolvePriorSuccessfulSend({
        draftId,
        assetId: draft.item.assetId,
      });
      if (recovered) {
        return replayCachedSuccess(recovered, hooks);
      }
      await clearSendInflight(draftId);
      const mapped = mapSteamSendError(result.error, result.strError);
      return { ok: false, code: mapped.code, message: mapped.message };
    }

    if (!midFlowHooksFired) {
      await hooks?.onItemSelected?.({
        assetId: draft.item.assetId,
        marketHashName: draft.item.marketHashName ?? null,
        floatValue: draft.item.floatValue ?? null,
      });
      await hooks?.onOfferSubmitted?.();
    }

    await cacheSentOffer(
      draftId,
      {
        ok: true,
        offerId: result.offerId,
        confirmPending: result.confirmPending,
      },
      {
        assetId: draft.item.assetId,
        marketHashName: draft.item.marketHashName ?? null,
        floatValue: draft.item.floatValue ?? null,
      },
    );
    await chrome.storage.session.remove(draftStorageKey(draftId));

    return {
      ok: true,
      offerId: result.offerId,
      confirmPending: result.confirmPending,
    };
  }
}
