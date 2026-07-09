const STEAM_ORIGIN = 'https://steamcommunity.com/';

export async function getSteamCommunityCookies(): Promise<chrome.cookies.Cookie[]> {
  return chrome.cookies.getAll({ url: STEAM_ORIGIN });
}

export function parseSteamIdFromLoginCookie(
  value: string | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const decoded = decodeURIComponent(value);
  const steamId = decoded.split('||')[0]?.trim();
  return steamId && /^\d{17}$/.test(steamId) ? steamId : null;
}

export async function resolveLoggedInSteamId(): Promise<string | null> {
  const cookies = await getSteamCommunityCookies();
  const loginSecure = cookies.find((cookie) => cookie.name === 'steamLoginSecure');
  const fromLoginSecure = parseSteamIdFromLoginCookie(loginSecure?.value);
  if (fromLoginSecure) {
    return fromLoginSecure;
  }

  const hasSession = cookies.some(
    (cookie) =>
      (cookie.name === 'sessionid' || cookie.name === 'steamLogin') &&
      Boolean(cookie.value),
  );
  if (!hasSession) {
    return null;
  }

  try {
    const response = await fetch(`${STEAM_ORIGIN}my/profile/`, {
      credentials: 'include',
      redirect: 'follow',
    });
    const profileMatch = response.url.match(/profiles\/(\d{17})/);
    return profileMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function hasSteamBrowserSession(): Promise<boolean> {
  const steamId = await resolveLoggedInSteamId();
  return steamId !== null;
}
