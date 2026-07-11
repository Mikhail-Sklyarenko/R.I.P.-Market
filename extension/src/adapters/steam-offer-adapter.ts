import type {
  DraftOfferInput,
  DraftOfferResult,
  SendOfferHooks,
  SendOfferResult,
  SteamInventoryItem,
} from '../types.js';

export interface SteamOfferAdapter {
  resolveSessionSteamId(): Promise<string | null>;
  loadSellerInventory(
    sellerSteamId?: string | null,
  ): Promise<SteamInventoryItem[] | null>;
  warmTradePage(buyerTradeUrl: string): Promise<boolean>;
  draftOffer(input: DraftOfferInput): Promise<DraftOfferResult>;
  sendOffer(draftId: string, hooks?: SendOfferHooks): Promise<SendOfferResult>;
}
