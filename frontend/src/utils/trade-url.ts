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
    return Boolean(partner && /^\d+$/.test(partner) && token && token.length > 0);
  } catch {
    return false;
  }
}
