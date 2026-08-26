import type { SteamOfferAdapter } from './steam-offer-adapter.js';
import type { DraftOfferInput, SendOfferHooks, SteamInventoryItem } from '../types.js';
import type { SellerInventoryLoadResult } from './inventory-load.types.js';
import { OfferErrorCode } from '../error-codes.js';

export type MockSteamScenario =
  | 'happy_path'
  | 'buyer_url_missing'
  | 'item_missing'
  | 'item_mismatch'
  | 'inventory_not_loaded'
  | 'inventory_private'
  | 'inventory_rate_limited'
  | 'steam_cookie_expired'
  | 'steam_unavailable'
  | 'confirm_pending'
  | 'confirm_pending_with_offer_id'
  | 'invalid_offer_id'
  | 'send_failed';

export class MockSteamOfferAdapter implements SteamOfferAdapter {
  constructor(private readonly scenario: MockSteamScenario = 'happy_path') {}

  private inventory: SteamInventoryItem[] = [
    {
      assetId: 'asset-123',
      classId: 'class-1',
      instanceId: 'instance-1',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
    },
  ];

  async resolveSessionSteamId() {
    if (this.scenario === 'steam_cookie_expired') {
      return null;
    }
    return '76561198000000000';
  }

  async loadSellerInventory(
    _sellerSteamId?: string | null,
  ): Promise<SellerInventoryLoadResult> {
    if (this.scenario === 'steam_unavailable' || this.scenario === 'inventory_not_loaded') {
      return {
        items: [],
        errorCode: OfferErrorCode.INVENTORY_NOT_LOADED,
        errorMessage: 'Seller inventory is not loaded',
      };
    }
    if (this.scenario === 'inventory_private') {
      return {
        items: [],
        errorCode: OfferErrorCode.INVENTORY_PRIVATE,
        errorMessage: 'Steam inventory is private',
      };
    }
    if (this.scenario === 'inventory_rate_limited') {
      return {
        items: [],
        errorCode: OfferErrorCode.INVENTORY_RATE_LIMITED,
        errorMessage: 'Steam inventory rate limited (HTTP 429)',
      };
    }
    if (this.scenario === 'steam_cookie_expired') {
      return {
        items: [],
        errorCode: OfferErrorCode.STEAM_COOKIE_EXPIRED,
        errorMessage: 'Seller is not logged into Steam in this browser',
      };
    }
    if (this.scenario === 'item_missing') {
      return {
        items: [
          {
            assetId: 'other-asset',
            marketHashName: 'Other Item',
          },
        ],
      };
    }
    return { items: this.inventory };
  }

  async warmTradePage(_buyerTradeUrl: string) {
    return true;
  }

  async draftOffer(input: DraftOfferInput) {
    if (this.scenario === 'buyer_url_missing') {
      return {
        ok: false as const,
        code: OfferErrorCode.BUYER_TRADE_URL_INVALID,
        message: 'invalid trade url',
      };
    }
    if (this.scenario === 'item_mismatch') {
      return {
        ok: false as const,
        code: OfferErrorCode.ITEM_MISMATCH,
        message: 'item mismatch',
      };
    }
    if (!input.buyerTradeUrl.includes('partner=')) {
      return {
        ok: false as const,
        code: OfferErrorCode.BUYER_TRADE_URL_INVALID,
        message: 'invalid trade url',
      };
    }
    return { ok: true as const, draftId: `draft-${input.item.assetId}` };
  }

  async sendOffer(draftId: string, hooks?: SendOfferHooks) {
    const item = this.inventory[0];
    if (item) {
      await hooks?.onItemSelected?.({
        assetId: item.assetId,
        marketHashName: item.marketHashName,
      });
    }
    await hooks?.onOfferSubmitted?.();

    if (this.scenario === 'send_failed') {
      return {
        ok: false as const,
        code: OfferErrorCode.OFFER_SEND_FAILED,
        message: 'send failed',
      };
    }
    if (this.scenario === 'confirm_pending') {
      return {
        ok: true as const,
        offerId: 'pending-offer',
        confirmPending: true,
      };
    }
    if (this.scenario === 'confirm_pending_with_offer_id') {
      return {
        ok: true as const,
        offerId: '88776655',
        confirmPending: true,
      };
    }
    if (this.scenario === 'invalid_offer_id') {
      return {
        ok: true as const,
        offerId: 'not-a-real-offer-id',
        confirmPending: false,
      };
    }
    return { ok: true as const, offerId: '99887766' };
  }
}
