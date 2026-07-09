import type {
  DraftOfferInput,
  DraftOfferResult,
  SendOfferHooks,
  SendOfferResult,
  SteamInventoryItem,
} from '@rip-market/extension-orchestrator';
import type { SteamOfferAdapter } from '@rip-market/extension-orchestrator';
import { OfferErrorCode } from '@rip-market/extension-orchestrator';
import {
  SteamCommunityClient,
  type TradeOfferDraft,
} from '../shared/steam-community-client.js';
import { mapSteamSendError } from '../shared/trade-offer-send-errors.js';
import {
  cacheSentOffer,
  getCachedSentOffer,
} from '../shared/trade-offer-sent-cache.js';

function draftStorageKey(draftId: string): string {
  return `rip:draft:${draftId}`;
}

export class MessageSteamOfferAdapter implements SteamOfferAdapter {
  constructor(private readonly steam = new SteamCommunityClient()) {}

  async resolveSessionSteamId(): Promise<string | null> {
    return this.steam.resolveSessionSteamId();
  }

  async loadSellerInventory(
    sellerSteamId?: string | null,
  ): Promise<SteamInventoryItem[] | null> {
    const steamId = sellerSteamId ?? (await this.steam.resolveSessionSteamId());
    if (!steamId) {
      return null;
    }
    const items = await this.steam.loadInventory(steamId);
    return items.length > 0 ? items : null;
  }

  async draftOffer(input: DraftOfferInput): Promise<DraftOfferResult> {
    const draftId = input.taskId
      ? `draft-${input.taskId}`
      : `draft-${input.item.assetId}`;
    const draft: TradeOfferDraft = {
      buyerTradeUrl: input.buyerTradeUrl,
      item: input.item,
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
    const cached = await getCachedSentOffer(draftId);
    if (cached?.ok) {
      await hooks?.onItemSelected?.({
        assetId: cached.assetId ?? cached.offerId,
        marketHashName: cached.marketHashName ?? null,
      });
      await hooks?.onOfferSubmitted?.();
      return {
        ok: true,
        offerId: cached.offerId,
        confirmPending: cached.confirmPending,
      };
    }

    const stored = await chrome.storage.session.get(draftStorageKey(draftId));
    const draft = stored[draftStorageKey(draftId)] as TradeOfferDraft | undefined;
    if (!draft) {
      return {
        ok: false,
        code: OfferErrorCode.OFFER_DRAFT_FAILED,
        message: 'Draft not found — retry from inventory',
      };
    }

    const result = await this.steam.sendTradeOffer(draft);

    if (!result.ok) {
      const mapped = mapSteamSendError(result.error, result.strError);
      return { ok: false, code: mapped.code, message: mapped.message };
    }

    await hooks?.onItemSelected?.({
      assetId: draft.item.assetId,
      marketHashName: draft.item.marketHashName ?? null,
    });
    await hooks?.onOfferSubmitted?.();

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
