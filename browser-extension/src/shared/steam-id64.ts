/**
 * SteamID64 helpers for extension surfaces (mirrors backend steam-id.util).
 */

export const STEAM_ID64_BASE = 76561197960265728n;

export function isRealSteamId64(steamId: string | null | undefined): boolean {
  return typeof steamId === 'string' && /^7656119\d{10}$/.test(steamId.trim());
}

export function accountIdToSteamId64(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (!/^\d{1,17}$/.test(trimmed)) {
    return null;
  }
  try {
    const id = BigInt(trimmed);
    if (id < 0n || id > 0xffffffffn) {
      return null;
    }
    return (id + STEAM_ID64_BASE).toString();
  } catch {
    return null;
  }
}

export function buildSteamProfileUrl(steamId64: string): string {
  return `https://steamcommunity.com/profiles/${steamId64.trim()}`;
}

/** Extract SteamID64 from a Steam community profile/id URL or raw id. */
export function extractSteamId64FromHref(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }
  const trimmed = href.trim();
  const profileMatch = trimmed.match(/\/profiles\/(7656119\d{10})\b/i);
  if (profileMatch?.[1]) {
    return profileMatch[1];
  }
  if (isRealSteamId64(trimmed)) {
    return trimmed.trim();
  }
  return null;
}
