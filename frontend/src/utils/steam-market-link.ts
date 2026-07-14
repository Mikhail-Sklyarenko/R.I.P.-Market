import type { CatalogItem } from '../api/types';
import type { ItemDisplaySource } from './item-image';
import { parseWearCodeFromMarketHashName } from './catalog-lot-display';

const STEAM_MARKET_APP_ID = 730;

export function buildSteamMarketListingUrl(marketHashName: string): string {
  return `https://steamcommunity.com/market/listings/${STEAM_MARKET_APP_ID}/${encodeURIComponent(marketHashName.trim())}`;
}

export function toCatalogItemDisplaySource(item: CatalogItem): ItemDisplaySource {
  return {
    wear: parseWearCodeFromMarketHashName(item.marketHashName),
    floatValue: null,
    itemDefinition: {
      marketHashName: item.marketHashName,
      weapon: item.weapon,
      rarity: item.rarity,
      iconUrl: item.iconUrl,
    },
  };
}
