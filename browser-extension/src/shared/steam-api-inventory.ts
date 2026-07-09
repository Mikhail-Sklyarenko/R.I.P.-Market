import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';
import {
  fetchAllInventoryPages,
  type InventoryResponseBody,
  parseInventoryPage,
} from './steam-inventory-loader.js';

const CS2_APP_ID = 730;
const CS2_CONTEXT = 2;
const WEB_API_ENDPOINT =
  'https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/';

type WebApiInventoryAsset = {
  assetid: string;
  classid: string;
  instanceid: string;
};

type WebApiInventoryDescription = {
  classid: string;
  instanceid: string;
  market_hash_name?: string;
  market_name?: string;
};

type WebApiInventoryResponse = {
  response?: {
    success?: number;
    assets?: WebApiInventoryAsset[];
    descriptions?: WebApiInventoryDescription[];
    more_items?: number;
    last_assetid?: string;
    error?: string;
  };
};

export function mapWebApiInventoryBody(
  body: WebApiInventoryResponse,
): InventoryResponseBody {
  const response = body.response ?? {};
  return {
    success: response.success ?? (response.assets ? 1 : 0),
    assets: response.assets,
    descriptions: response.descriptions?.map((description) => ({
      classid: description.classid,
      instanceid: description.instanceid,
      market_hash_name: description.market_hash_name,
      market_name: description.market_name,
    })),
    more_items: response.more_items,
    last_assetid: response.last_assetid,
    error: response.error,
  };
}

function buildWebApiInventoryUrl(
  steamId: string,
  apiKey: string,
  startAssetId?: string,
): string {
  const url = new URL(WEB_API_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId);
  url.searchParams.set('appid', String(CS2_APP_ID));
  url.searchParams.set('contextid', String(CS2_CONTEXT));
  url.searchParams.set('get_descriptions', '1');
  url.searchParams.set('language', 'english');
  url.searchParams.set('count', '500');
  if (startAssetId) {
    url.searchParams.set('start_assetid', startAssetId);
  }
  return url.toString();
}

export async function fetchInventoryViaWebApi(
  steamId: string,
  apiKey: string,
): Promise<SteamInventoryItem[]> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return [];
  }

  return fetchAllInventoryPages(async (startAssetId) => {
    const response = await fetch(buildWebApiInventoryUrl(steamId, trimmedKey, startAssetId));
    if (!response.ok) {
      throw new Error(`Steam Web API inventory HTTP ${response.status}`);
    }

    const body = (await response.json()) as WebApiInventoryResponse;
    return mapWebApiInventoryBody(body);
  });
}

export function toFindAssetInventoryItem(item: SteamInventoryItem): SteamInventoryItem {
  return {
    assetId: String(item.assetId),
    classId: item.classId ? String(item.classId) : undefined,
    instanceId: item.instanceId ? String(item.instanceId) : undefined,
    marketHashName: item.marketHashName?.trim() || undefined,
  };
}
