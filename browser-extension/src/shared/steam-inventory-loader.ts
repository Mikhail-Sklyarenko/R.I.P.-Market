import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';

const CS2_APP_ID = 730;
const CS2_CONTEXT = 2;

export type InventoryResponseBody = {
  success?: number;
  assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
  descriptions?: Array<{
    classid: string;
    instanceid: string;
    market_hash_name?: string;
    market_name?: string;
  }>;
  asset_properties?: Array<{
    assetid: string;
    asset_properties?: Array<{
      propertyid: number;
      float_value?: string;
    }>;
  }>;
  more_items?: number;
  last_assetid?: string;
  error?: string;
};

function readFloatValue(
  assetId: string,
  assetProperties?: InventoryResponseBody['asset_properties'],
): string | null {
  const entry = assetProperties?.find((item) => String(item.assetid) === assetId);
  const floatProp = entry?.asset_properties?.find((prop) => prop.propertyid === 1);
  return floatProp?.float_value ?? null;
}

export function parseInventoryPage(body: InventoryResponseBody): SteamInventoryItem[] {
  if (body.success === 0) {
    throw new Error(body.error ?? 'Steam inventory unavailable');
  }

  const descriptions = new Map<
    string,
    { marketHashName?: string; marketName?: string }
  >();
  for (const description of body.descriptions ?? []) {
    descriptions.set(`${description.classid}_${description.instanceid}`, {
      marketHashName: description.market_hash_name,
      marketName: description.market_name,
    });
  }

  return (body.assets ?? []).map((asset) => {
    const meta = descriptions.get(`${asset.classid}_${asset.instanceid}`);
    return {
      assetId: String(asset.assetid),
      classId: asset.classid,
      instanceId: asset.instanceid,
      marketHashName: meta?.marketHashName ?? meta?.marketName,
      floatValue: readFloatValue(String(asset.assetid), body.asset_properties),
    };
  });
}

export async function fetchAllInventoryPages(
  fetchPage: (startAssetId?: string) => Promise<InventoryResponseBody>,
): Promise<SteamInventoryItem[]> {
  const merged = new Map<string, SteamInventoryItem>();
  let startAssetId: string | undefined;
  let pageCount = 0;

  while (pageCount < 20) {
    const page = await fetchPage(startAssetId);
    for (const item of parseInventoryPage(page)) {
      merged.set(item.assetId, item);
    }

    if (!page.more_items || !page.last_assetid) {
      break;
    }

    startAssetId = page.last_assetid;
    pageCount += 1;
  }

  return [...merged.values()];
}

export function buildInventoryUrl(steamId: string, startAssetId?: string): string {
  const url = new URL(
    `https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/${CS2_CONTEXT}`,
  );
  url.searchParams.set('l', 'english');
  url.searchParams.set('count', '500');
  if (startAssetId) {
    url.searchParams.set('start_assetid', startAssetId);
  }
  return url.toString();
}
