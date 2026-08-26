import { STEAM_WEB_API_OPTIONAL_ORIGINS } from './extension-privacy.js';

export const STEAM_WEB_API_KEY_STORAGE_KEY = 'steamWebApiKey';

export async function getSteamWebApiKey(): Promise<string | null> {
  const stored = await chrome.storage.local.get(STEAM_WEB_API_KEY_STORAGE_KEY);
  const value = stored[STEAM_WEB_API_KEY_STORAGE_KEY];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function hasSteamWebApiHostPermission(): Promise<boolean> {
  if (!chrome.permissions?.contains) {
    return false;
  }
  return chrome.permissions.contains({
    origins: [...STEAM_WEB_API_OPTIONAL_ORIGINS],
  });
}

/**
 * Requests optional api.steampowered.com access only when the user saves a key.
 * Returns false if the user denies the Chrome permission prompt.
 */
export async function ensureSteamWebApiHostPermission(): Promise<boolean> {
  if (await hasSteamWebApiHostPermission()) {
    return true;
  }
  if (!chrome.permissions?.request) {
    return false;
  }
  return chrome.permissions.request({
    origins: [...STEAM_WEB_API_OPTIONAL_ORIGINS],
  });
}

export async function revokeSteamWebApiHostPermission(): Promise<void> {
  if (!chrome.permissions?.remove) {
    return;
  }
  const granted = await hasSteamWebApiHostPermission();
  if (!granted) {
    return;
  }
  await chrome.permissions.remove({
    origins: [...STEAM_WEB_API_OPTIONAL_ORIGINS],
  });
}

export type SaveSteamWebApiKeyResult =
  | { ok: true }
  | { ok: false; reason: 'permission_denied' | 'empty' };

/**
 * Persists the backup key only after optional host permission is granted.
 * Empty input clears the key and drops the optional host.
 */
export async function saveSteamWebApiKey(
  apiKey: string,
): Promise<SaveSteamWebApiKeyResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await clearSteamWebApiKey();
    return { ok: false, reason: 'empty' };
  }
  const granted = await ensureSteamWebApiHostPermission();
  if (!granted) {
    return { ok: false, reason: 'permission_denied' };
  }
  await chrome.storage.local.set({ [STEAM_WEB_API_KEY_STORAGE_KEY]: trimmed });
  return { ok: true };
}

export async function clearSteamWebApiKey(): Promise<void> {
  await chrome.storage.local.remove(STEAM_WEB_API_KEY_STORAGE_KEY);
  await revokeSteamWebApiHostPermission();
}
