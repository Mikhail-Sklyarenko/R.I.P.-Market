export const MOCK_STEAM_ID_PREFIX = 'steam_mock_';

/** Base offset for converting Steam account ID ↔ SteamID64. */
export const STEAM_ID64_BASE = 76561197960265728n;

export function isMockSteamId(steamId: string | null | undefined): boolean {
  return (
    typeof steamId === 'string' && steamId.startsWith(MOCK_STEAM_ID_PREFIX)
  );
}

/** SteamID64 for individual Steam accounts. */
export function isRealSteamId(steamId: string | null | undefined): boolean {
  return typeof steamId === 'string' && /^7656119\d{10}$/.test(steamId);
}

export function hasLinkedSteamId(steamId: string | null | undefined): boolean {
  return isRealSteamId(steamId);
}

export function steamId64ToAccountId(steamId64: string): string | null {
  if (!isRealSteamId(steamId64)) {
    return null;
  }
  const accountId = BigInt(steamId64) - STEAM_ID64_BASE;
  if (accountId < 0n) {
    return null;
  }
  return accountId.toString();
}

export function accountIdToSteamId64(accountId: string): string | null {
  if (!/^\d+$/.test(accountId)) {
    return null;
  }
  return (BigInt(accountId) + STEAM_ID64_BASE).toString();
}
