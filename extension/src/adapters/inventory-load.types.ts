import type { SteamInventoryItem } from '../types.js';
import type { OfferErrorCodeType } from '../error-codes.js';

export type SellerInventoryLoadResult = {
  /** Non-empty on success. Empty array means load finished but no items matched filters. */
  items: SteamInventoryItem[];
  /** Present when inventory could not be loaded for a diagnosed reason. */
  errorCode?: OfferErrorCodeType;
  errorMessage?: string;
};

export type { SteamInventoryItem };
