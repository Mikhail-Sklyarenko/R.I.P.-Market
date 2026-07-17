import type { CatalogItem } from '../api/types';
import type { ItemDisplaySource } from './item-image';

const STEAM_MARKET_APP_ID = 730;

export const WEAR_CODE_TO_STEAM_SUFFIX: Record<string, string> = {
  FN: 'Factory New',
  MW: 'Minimal Wear',
  FT: 'Field-Tested',
  WW: 'Well-Worn',
  BS: 'Battle-Scarred',
};

const WEAR_SUFFIX_TO_CODE: Record<string, string> = {
  'factory new': 'FN',
  'minimal wear': 'MW',
  'field-tested': 'FT',
  'well-worn': 'WW',
  'battle-scarred': 'BS',
};

const WEAR_INPUT_TO_CODE: Record<string, string> = {
  fn: 'FN',
  mw: 'MW',
  ft: 'FT',
  ww: 'WW',
  bs: 'BS',
  ...WEAR_SUFFIX_TO_CODE,
};

export function normalizeWearCode(wear?: string | null): string | null {
  if (!wear?.trim()) {
    return null;
  }
  return WEAR_INPUT_TO_CODE[wear.trim().toLowerCase()] ?? null;
}

export function parseWearCodeFromMarketHashName(
  marketHashName: string,
): string | null {
  const match = marketHashName.trim().match(/\(([^)]+)\)\s*$/);
  if (!match?.[1]) {
    return null;
  }
  return WEAR_SUFFIX_TO_CODE[match[1].toLowerCase()] ?? null;
}

/**
 * Build the exact Steam market_hash_name for a listing URL.
 * Prefer explicit wear (lot asset / snapshot) over a mismatched suffix in the name.
 */
export function resolveSteamMarketHashName(
  marketHashName: string,
  wear?: string | null,
): string {
  const trimmed = marketHashName.trim();
  if (!trimmed) {
    return trimmed;
  }

  const wearCode =
    normalizeWearCode(wear) ?? parseWearCodeFromMarketHashName(trimmed);
  const wearSuffix = wearCode ? WEAR_CODE_TO_STEAM_SUFFIX[wearCode] : undefined;
  const match = trimmed.match(/^(.*)\s+\(([^)]+)\)\s*$/);

  if (match) {
    const baseName = match[1].trim();
    const existingSuffix = match[2];
    if (
      wearSuffix &&
      existingSuffix.toLowerCase() !== wearSuffix.toLowerCase()
    ) {
      return `${baseName} (${wearSuffix})`;
    }
    return trimmed;
  }

  if (wearSuffix) {
    return `${trimmed} (${wearSuffix})`;
  }

  return trimmed;
}

export function buildSteamMarketListingUrl(
  marketHashName: string,
  wear?: string | null,
): string {
  const resolved = resolveSteamMarketHashName(marketHashName, wear);
  return `https://steamcommunity.com/market/listings/${STEAM_MARKET_APP_ID}/${encodeURIComponent(resolved)}`;
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
