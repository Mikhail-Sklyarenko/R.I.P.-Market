import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';
import {
  type InventoryLoadResult,
} from './inventory-load-result.js';

type PageInventoryResult =
  | { ok: true; items: SteamInventoryItem[] }
  | { ok: false; error: string; rateLimited?: boolean };

export async function loadInventoryViaPageScript(
  tabId: number,
  preferredSteamId?: string | null,
): Promise<InventoryLoadResult> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [preferredSteamId ?? null],
    func: async (steamIdArg: string | null): Promise<PageInventoryResult> => {
      async function resolveSteamId(): Promise<string | null> {
        if (steamIdArg && /^\d{17}$/.test(steamIdArg)) {
          return steamIdArg;
        }
        const win = window as unknown as { g_steamID?: string };
        if (win.g_steamID && /^\d{17}$/.test(win.g_steamID)) {
          return win.g_steamID;
        }
        const profileResponse = await fetch(
          'https://steamcommunity.com/my/profile/',
          { credentials: 'include', redirect: 'follow' },
        );
        const profileMatch = profileResponse.url.match(/profiles\/(\d{17})/);
        return profileMatch?.[1] ?? null;
      }

      async function fetchPage(steamId: string, startAssetId?: string) {
        const url = new URL(
          `https://steamcommunity.com/inventory/${steamId}/730/2`,
        );
        url.searchParams.set('l', 'english');
        url.searchParams.set('count', '500');
        if (startAssetId) {
          url.searchParams.set('start_assetid', startAssetId);
        }
        const response = await fetch(url.toString(), {
          credentials: 'include',
          headers: {
            Referer: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
          },
        });
        if (!response.ok) {
          if (response.status === 429) {
            throw Object.assign(new Error('Inventory HTTP 429'), { rateLimited: true });
          }
          throw new Error(`Inventory HTTP ${response.status}`);
        }
        return (await response.json()) as {
          success?: number;
          assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
          descriptions?: Array<{
            classid: string;
            instanceid: string;
            market_hash_name?: string;
            market_name?: string;
          }>;
          more_items?: number;
          last_assetid?: string;
          error?: string;
        };
      }

      function parsePage(body: {
        success?: number;
        assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
        descriptions?: Array<{
          classid: string;
          instanceid: string;
          market_hash_name?: string;
          market_name?: string;
        }>;
        error?: string;
      }) {
        if (body.success === 15) {
          throw new Error('Steam inventory is private');
        }
        if (body.success === 0) {
          throw new Error(body.error ?? 'Steam inventory unavailable');
        }
        const descriptions = new Map<string, string | undefined>();
        for (const description of body.descriptions ?? []) {
          descriptions.set(
            `${description.classid}_${description.instanceid}`,
            description.market_hash_name ?? description.market_name,
          );
        }
        return (body.assets ?? []).map((asset) => ({
          assetId: String(asset.assetid),
          classId: asset.classid,
          instanceId: asset.instanceid,
          marketHashName: descriptions.get(
            `${asset.classid}_${asset.instanceid}`,
          ),
        }));
      }

      try {
        const steamId = await resolveSteamId();
        if (!steamId) {
          return { ok: false, error: 'Steam ID not found on page' };
        }

        const merged = new Map<string, SteamInventoryItem>();
        let startAssetId: string | undefined;
        for (let page = 0; page < 20; page += 1) {
          const body = await fetchPage(steamId, startAssetId);
          for (const item of parsePage(body)) {
            merged.set(item.assetId, item);
          }
          if (!body.more_items || !body.last_assetid) {
            break;
          }
          startAssetId = body.last_assetid;
        }

        return { ok: true, items: [...merged.values()] };
      } catch (error) {
        const rateLimited =
          (error instanceof Error &&
            'rateLimited' in error &&
            Boolean((error as { rateLimited?: boolean }).rateLimited)) ||
          /HTTP 429/.test(error instanceof Error ? error.message : '');
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Inventory load failed',
          rateLimited,
        };
      }
    },
  });

  const value = result?.result as PageInventoryResult | undefined;
  if (!value?.ok) {
    console.warn('[rip-market] page inventory failed', value?.error);
    return {
      items: [],
      rateLimited: Boolean(value?.rateLimited),
    };
  }
  return {
    items: value.items,
    rateLimited: false,
  };
}
