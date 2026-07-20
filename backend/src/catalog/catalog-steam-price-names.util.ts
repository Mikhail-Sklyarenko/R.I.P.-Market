import {
  buildMarketHashNameWithWear,
  stripWearFromMarketHashName,
} from '../item-definitions/base-market-hash-name.util';
import { normalizeWearCode } from '../lots/steam-market-link.util';

const WEAR_FETCH_PRIORITY = ['FT', 'MW', 'FN', 'WW', 'BS'] as const;

/**
 * Steam priceoverview needs wear suffixes for weapon skins.
 * Catalog cards store base names — try the most liquid wears first (max 2).
 * Non-wear items (stickers, agents, …) are queried as-is.
 */
export function resolveSteamMarketNamesForCatalogCard(
  catalogMarketHashName: string,
  availableWears: unknown,
): string[] {
  const base = stripWearFromMarketHashName(catalogMarketHashName);
  const wearCodes = parseAvailableWearCodes(availableWears);
  if (wearCodes.length === 0) {
    return [catalogMarketHashName.trim()];
  }

  const ordered = WEAR_FETCH_PRIORITY.filter((code) => wearCodes.includes(code));
  const codes = ordered.length > 0 ? ordered : wearCodes;
  return codes.slice(0, 2).map((code) => buildMarketHashNameWithWear(base, code));
}

function parseAvailableWearCodes(availableWears: unknown): string[] {
  if (!Array.isArray(availableWears)) {
    return [];
  }
  const codes: string[] = [];
  for (const entry of availableWears) {
    const raw =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && 'name' in entry
          ? String((entry as { name?: unknown }).name ?? '')
          : '';
    const code = normalizeWearCode(raw);
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}
