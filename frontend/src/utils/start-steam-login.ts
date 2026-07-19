import { getSteamLoginUrl } from '../api/marketplace';
import { rememberSteamReturnPath } from './steam-return-path';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

/** Start Steam OpenID and optionally remember where to return after login. */
export async function startSteamLogin(
  returnPath?: string | null,
): Promise<void> {
  rememberSteamReturnPath(returnPath ?? null);
  const callbackUrl = `${API_BASE_URL}/auth/steam/callback`;
  const response = await getSteamLoginUrl(callbackUrl);
  window.location.href = response.url;
}
