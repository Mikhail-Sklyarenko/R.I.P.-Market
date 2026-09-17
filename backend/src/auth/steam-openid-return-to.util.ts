import { getApiPublicBaseUrl } from './steam-api-base.util';

/** Canonical OpenID return_to for Steam login (no query string). */
export function getSteamOpenIdCallbackUrl(): string {
  return `${getApiPublicBaseUrl()}/auth/steam/callback`;
}

/**
 * True when openid.return_to matches our API callback path.
 * Query string (e.g. link_state) is allowed; origin/path must match exactly.
 */
export function isAllowedSteamOpenIdReturnTo(
  returnTo: string | undefined,
  expectedCallbackUrl: string = getSteamOpenIdCallbackUrl(),
): boolean {
  if (!returnTo) {
    return false;
  }
  try {
    const actual = new URL(returnTo);
    const expected = new URL(expectedCallbackUrl);
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}
