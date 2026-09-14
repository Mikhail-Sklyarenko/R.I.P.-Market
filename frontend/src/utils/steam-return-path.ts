const STEAM_POST_LOGIN_PATH_KEY = 'rip_market_steam_return';

/** Frontend path to open after Steam OAuth (must be same-origin relative). */
export function safeAppReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }
  return raw;
}

export function rememberSteamReturnPath(path: string | null | undefined): void {
  try {
    const safe = safeAppReturnPath(path ?? null);
    if (safe) sessionStorage.setItem(STEAM_POST_LOGIN_PATH_KEY, safe);
    else sessionStorage.removeItem(STEAM_POST_LOGIN_PATH_KEY);
  } catch { /* Login must still work when browser storage is unavailable. */ }
}

export function consumeSteamReturnPath(): string | null {
  try {
    const raw = sessionStorage.getItem(STEAM_POST_LOGIN_PATH_KEY);
    sessionStorage.removeItem(STEAM_POST_LOGIN_PATH_KEY);
    return safeAppReturnPath(raw);
  } catch { return null; }
}
