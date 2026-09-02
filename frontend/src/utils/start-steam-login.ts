import { getConfiguredApiBaseUrl } from '../api/base-url';
import { getSteamLoginUrl } from '../api/marketplace';
import { rememberSteamReturnPath } from './steam-return-path';

/** Start Steam OpenID and optionally remember where to return after login. */
export async function startSteamLogin(
  returnPath?: string | null,
): Promise<void> {
  rememberSteamReturnPath(returnPath ?? null);
  // OpenID realm is the apex host — callback must not switch to www.
  const callbackUrl = `${getConfiguredApiBaseUrl()}/auth/steam/callback`;
  const response = await getSteamLoginUrl(callbackUrl);
  window.location.href = response.url;
}
