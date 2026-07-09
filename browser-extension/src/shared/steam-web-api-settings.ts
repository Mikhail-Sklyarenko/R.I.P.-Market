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

export async function saveSteamWebApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await clearSteamWebApiKey();
    return;
  }
  await chrome.storage.local.set({ [STEAM_WEB_API_KEY_STORAGE_KEY]: trimmed });
}

export async function clearSteamWebApiKey(): Promise<void> {
  await chrome.storage.local.remove(STEAM_WEB_API_KEY_STORAGE_KEY);
}
