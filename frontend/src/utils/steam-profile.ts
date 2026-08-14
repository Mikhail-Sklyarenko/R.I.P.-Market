import { isRealSteamId } from './steam-id';

export function buildSteamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

export function formatCounterpartyDisplayName(input: {
  username: string;
  steamPersonaName?: string | null;
}): string {
  const persona = input.steamPersonaName?.trim();
  return persona || input.username;
}

export function canLinkSteamProfile(steamId: string | null | undefined): steamId is string {
  return typeof steamId === 'string' && steamId.length > 0 && isRealSteamId(steamId);
}
