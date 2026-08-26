import type {
  DraftOfferInput,
  DraftOfferResult,
  SendOfferHooks,
  SendOfferResult,
} from '../types.js';
import type { SellerInventoryLoadResult } from './inventory-load.types.js';

export type { SellerInventoryLoadResult } from './inventory-load.types.js';

export interface SteamOfferAdapter {
  resolveSessionSteamId(): Promise<string | null>;
  loadSellerInventory(
    sellerSteamId?: string | null,
  ): Promise<SellerInventoryLoadResult>;
  warmTradePage(buyerTradeUrl: string): Promise<boolean>;
  draftOffer(input: DraftOfferInput): Promise<DraftOfferResult>;
  sendOffer(draftId: string, hooks?: SendOfferHooks): Promise<SendOfferResult>;
}
