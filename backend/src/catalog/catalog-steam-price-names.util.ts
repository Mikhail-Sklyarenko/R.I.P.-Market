import {
  buildMarketHashNameWithWear,
  stripWearFromMarketHashName,
} from '../item-definitions/base-market-hash-name.util';
import { normalizeWearCode } from '../lots/steam-market-link.util';

const WEAR_FETCH_PRIORITY = ['FT', 'MW', 'FN', 'WW', 'BS'] as const;

/**
 * Steam priceoverview needs wear suffixes for weapon skins.
 * Catalog cards store base names — try the most liquid wears first.
 * Non-wear items (stickers, agents, …) are queried as-is.
 */
export function resolveSteamMarketNamesForCatalogCard(
  catalogMarketHashName: string,
  availableWears: unknown,
): string[] {
  return resolveAllWearSteamMarketNames(catalogMarketHashName, availableWears);
}

/** All wears for bulk Steam refresh, ordered by liquidity (FT first). */
export function resolveAllWearSteamMarketNames(
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
  return codes.map((code) => buildMarketHashNameWithWear(base, code));
}

/** Catalog grid shows FT (most liquid) Steam price when item has wears. */
export function resolveCatalogCardDisplaySteamPriceName(
  catalogMarketHashName: string,
  availableWears: unknown,
): string {
  const names = resolveAllWearSteamMarketNames(
    catalogMarketHashName,
    availableWears,
  );
  return names[0] ?? catalogMarketHashName.trim();
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
