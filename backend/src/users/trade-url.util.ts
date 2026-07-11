export const STEAM_TRADE_URL_SETTINGS =
  'https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url';

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
