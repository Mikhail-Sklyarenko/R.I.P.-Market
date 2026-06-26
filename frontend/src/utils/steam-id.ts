export function isMockSteamId(steamId: string | null | undefined): boolean {
  return typeof steamId === 'string' && steamId.startsWith('steam_mock_');
}

export function isRealSteamId(steamId: string | null | undefined): boolean {
  return typeof steamId === 'string' && /^7656119\d{10}$/.test(steamId);
}

export function hasLinkedSteamId(steamId: string | null | undefined): boolean {
  return isRealSteamId(steamId);
}
