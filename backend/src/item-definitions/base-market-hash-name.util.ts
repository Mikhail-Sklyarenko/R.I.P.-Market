import {
  normalizeWearCode,
  parseWearCodeFromMarketHashName,
  WEAR_CODE_TO_STEAM_SUFFIX,
} from '../lots/steam-market-link.util';

const WEAR_SUFFIXES = Object.values(WEAR_CODE_TO_STEAM_SUFFIX);

/**
 * Strip trailing Steam wear suffix: "AK-47 | Redline (FT)" → "AK-47 | Redline".
 */
export function stripWearFromMarketHashName(marketHashName: string): string {
  const trimmed = marketHashName.trim();
  for (const suffix of WEAR_SUFFIXES) {
    const needle = ` (${suffix})`;
    if (trimmed.toLowerCase().endsWith(needle.toLowerCase())) {
      return trimmed.slice(0, -needle.length).trim();
    }
  }
  return trimmed;
}

export function deriveBaseMarketHashName(marketHashName: string): string {
  return stripWearFromMarketHashName(marketHashName);
}

export function wearCodesFromSteamWearNames(
  wears: Array<{ name?: string } | string> | null | undefined,
): string[] {
  if (!wears?.length) {
    return [];
  }
  const codes: string[] = [];
  for (const entry of wears) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const code = normalizeWearCode(name);
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

export function buildMarketHashNameWithWear(
  baseMarketHashName: string,
  wearCode: string,
): string {
  const code = normalizeWearCode(wearCode);
  if (!code) {
    return baseMarketHashName.trim();
  }
  const base = stripWearFromMarketHashName(baseMarketHashName);
  const suffix = WEAR_CODE_TO_STEAM_SUFFIX[code];
  return `${base} (${suffix})`;
}

export function collectWearCodeFromName(marketHashName: string): string | null {
  return parseWearCodeFromMarketHashName(marketHashName);
}
