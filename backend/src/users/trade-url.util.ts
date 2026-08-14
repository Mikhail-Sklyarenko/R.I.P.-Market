import {
  hasLinkedSteamId,
  steamId64ToAccountId,
} from '../common/steam-id.util';

export const STEAM_TRADE_URL_SETTINGS =
  'https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url';

export function parseTradeUrlPartnerAccountId(tradeUrl: string): string | null {
  const trimmed = tradeUrl.trim();
  if (!isValidSteamTradeUrl(trimmed)) {
    return null;
  }

  try {
    const partner = new URL(trimmed).searchParams.get('partner');
    return partner && /^\d+$/.test(partner) ? partner : null;
  } catch {
    return null;
  }
}

export function tradeUrlMatchesSteamId64(
  tradeUrl: string,
  steamId64: string | null | undefined,
): boolean {
  if (!hasLinkedSteamId(steamId64)) {
    return true;
  }

  const partner = parseTradeUrlPartnerAccountId(tradeUrl);
  const expected = steamId64ToAccountId(steamId64!);
  if (!partner || !expected) {
    return false;
  }
  return partner === expected;
}

export function buildSteamTradeUrl(partnerAccountId: string, token: string): string {
  const params = new URLSearchParams({
    partner: partnerAccountId,
    token,
  });
  return `https://steamcommunity.com/tradeoffer/new/?${params.toString()}`;
}

export function buildSteamTradeUrlForSteamId64(
  steamId64: string,
  token: string,
): string | null {
  const accountId = steamId64ToAccountId(steamId64);
  if (!accountId) {
    return null;
  }
  return buildSteamTradeUrl(accountId, token);
}

export function isValidSteamTradeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length < 10) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'steamcommunity.com') {
      return false;
    }
    if (parsed.pathname !== '/tradeoffer/new/') {
      return false;
    }
    const partner = parsed.searchParams.get('partner');
    const token = parsed.searchParams.get('token');
    return Boolean(
      partner && /^\d+$/.test(partner) && token && token.length > 0,
    );
  } catch {
    return false;
  }
}

export function hasValidTradeUrl(tradeUrl?: string | null): boolean {
  if (!tradeUrl?.trim()) {
    return false;
  }
  return isValidSteamTradeUrl(tradeUrl);
}
