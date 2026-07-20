import { isRealSteamId } from '../common/steam-id.util';

/**
 * Comma-separated SteamID64 allowlist for marketplace owner admins.
 * Example: OWNER_ADMIN_STEAM_IDS=76561198195181115
 */
export function parseOwnerAdminSteamIds(
  raw: string | undefined = process.env.OWNER_ADMIN_STEAM_IDS,
): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => isRealSteamId(value)),
  );
}

export function isOwnerAdminSteamId(
  steamId: string | null | undefined,
  allowlist: Set<string> = parseOwnerAdminSteamIds(),
): boolean {
  return Boolean(steamId && allowlist.has(steamId));
}
