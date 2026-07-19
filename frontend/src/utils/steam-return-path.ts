const STEAM_POST_LOGIN_PATH_KEY = 'rip_market_steam_return';

/** Frontend path to open after Steam OAuth (must be same-origin relative). */
export function safeAppReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  return raw;
}

export function rememberSteamReturnPath(path: string | null | undefined): void {
  const safe = safeAppReturnPath(path ?? null);
  if (!safe) {
    sessionStorage.removeItem(STEAM_POST_LOGIN_PATH_KEY);
    return;
  }
  sessionStorage.setItem(STEAM_POST_LOGIN_PATH_KEY, safe);
}

export function consumeSteamReturnPath(): string | null {
  const raw = sessionStorage.getItem(STEAM_POST_LOGIN_PATH_KEY);
  sessionStorage.removeItem(STEAM_POST_LOGIN_PATH_KEY);
  return safeAppReturnPath(raw);
}
