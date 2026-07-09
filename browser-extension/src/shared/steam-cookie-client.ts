import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';
import {
  buildInventoryUrl,
  fetchAllInventoryPages,
  type InventoryResponseBody,
} from './steam-inventory-loader.js';
import {
  emptyInventoryLoadResult,
  type InventoryLoadResult,
  isRateLimitedError,
} from './inventory-load-result.js';
import { fetchWithRetry } from './steam-fetch-retry.js';
import { hasSteamBrowserSession, resolveLoggedInSteamId } from './steam-session.js';

async function steamFetch(
  url: string,
  steamId: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers ?? {}),
      Referer: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
    },
  });
}

export async function loadCs2InventoryFromCookies(
  preferredSteamId?: string | null,
): Promise<InventoryLoadResult> {
  try {
    if (!(await hasSteamBrowserSession())) {
      console.warn('[rip-market] cookie inventory: no steam session');
      return emptyInventoryLoadResult();
    }

    const loggedInSteamId = await resolveLoggedInSteamId();
    const steamId = preferredSteamId ?? loggedInSteamId;
    if (!steamId) {
      console.warn('[rip-market] cookie inventory: steam id not found');
      return emptyInventoryLoadResult();
    }

    const items = await fetchAllInventoryPages(async (startAssetId) => {
      const response = await fetchWithRetry(() =>
        steamFetch(buildInventoryUrl(steamId, startAssetId), steamId),
      );
      if (!response.ok) {
        throw new Error(`Inventory HTTP ${response.status}`);
      }
      const body = (await response.json()) as InventoryResponseBody;
      if (body.success === 15) {
        throw new Error('Steam inventory is private');
      }
      return body;
    });

    return { items, rateLimited: false };
  } catch (error) {
    console.warn(
      '[rip-market] cookie inventory failed',
      error instanceof Error ? error.message : error,
    );
    return {
      items: [],
      rateLimited: isRateLimitedError(error),
    };
  }
}

export { resolveLoggedInSteamId } from './steam-session.js';
