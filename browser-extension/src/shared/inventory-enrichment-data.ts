import type {
  InventoryItemPlatformFacts,
  InventoryItemSteamFacts,
} from './inventory-item-enrichment.js';
import { parseWearFromMarketHashName } from './inventory-item-enrichment.js';
import {
  buildInventoryUrl,
  type InventoryResponseBody,
} from './steam-inventory-loader.js';

/**
 * Extended Steam inventory response fields needed for D2 card enrichment.
 */
export type EnrichmentInventoryDescription = {
  classid: string;
  instanceid: string;
  market_hash_name?: string;
  market_name?: string;
  tradable?: number;
  marketable?: number;
  cache_expiration?: string;
};

export type EnrichmentInventoryBody = InventoryResponseBody & {
  descriptions?: EnrichmentInventoryDescription[];
};

function readPaintSeed(
  assetId: string,
  assetProperties?: InventoryResponseBody['asset_properties'],
): number | null {
  const entry = assetProperties?.find((item) => String(item.assetid) === assetId);
  const seedProp = entry?.asset_properties?.find((prop) => prop.propertyid === 2);
  if (!seedProp?.int_value) {
    return null;
  }
  const seed = Number(seedProp.int_value);
  return Number.isFinite(seed) ? seed : null;
}

function readFloatValue(
  assetId: string,
  assetProperties?: InventoryResponseBody['asset_properties'],
): string | null {
  const entry = assetProperties?.find((item) => String(item.assetid) === assetId);
  const floatProp = entry?.asset_properties?.find((prop) => prop.propertyid === 1);
  return floatProp?.float_value ?? null;
}

export function parseInventoryEnrichmentPage(
  body: EnrichmentInventoryBody,
): InventoryItemSteamFacts[] {
  if (body.success === 0 || body.success === 15) {
    return [];
  }

  const descriptions = new Map<string, EnrichmentInventoryDescription>();
  for (const description of body.descriptions ?? []) {
    descriptions.set(`${description.classid}_${description.instanceid}`, description);
  }

  return (body.assets ?? []).map((asset) => {
    const assetId = String(asset.assetid);
    const meta = descriptions.get(`${asset.classid}_${asset.instanceid}`);
    const marketHashName =
      meta?.market_hash_name ?? meta?.market_name ?? null;
    return {
      assetId,
      marketHashName,
      floatValue: readFloatValue(assetId, body.asset_properties),
      paintSeed: readPaintSeed(assetId, body.asset_properties),
      wear: parseWearFromMarketHashName(marketHashName),
      tradable: meta?.tradable === 1,
      marketable:
        meta?.marketable === undefined
          ? meta?.tradable === 1
          : meta.marketable === 1,
      tradeLockUntil: meta?.cache_expiration ?? null,
    };
  });
}

export async function fetchCs2InventoryEnrichmentFacts(
  steamId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, InventoryItemSteamFacts>> {
  const merged = new Map<string, InventoryItemSteamFacts>();
  let startAssetId: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchImpl(buildInventoryUrl(steamId, startAssetId), {
      credentials: 'include',
      headers: {
        Referer: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
      },
    });
    if (!response.ok) {
      throw new Error(`Inventory HTTP ${response.status}`);
    }
    const body = (await response.json()) as EnrichmentInventoryBody;
    for (const item of parseInventoryEnrichmentPage(body)) {
      merged.set(item.assetId, item);
    }
    if (!body.more_items || !body.last_assetid) {
      break;
    }
    startAssetId = body.last_assetid;
  }

  return merged;
}

export type PlatformInventoryAssetRow = {
  id?: string;
  assetExternalId?: string;
  status?: string;
  activeLotId?: string | null;
  listedPriceMinor?: string | null;
};

export function buildPlatformFactsMap(params: {
  assets: PlatformInventoryAssetRow[];
  dealAssetIds: Set<string>;
  dealOrderByAssetId: Map<string, { orderId: string; siteUrl: string }>;
  tradeTaskAssetIds?: Set<string>;
  tradeTaskOrderByAssetId?: Map<string, { orderId: string; siteUrl: string }>;
  siteOrigin: string;
}): Map<string, InventoryItemPlatformFacts> {
  const map = new Map<string, InventoryItemPlatformFacts>();
  const tradeTaskAssetIds = params.tradeTaskAssetIds ?? new Set<string>();
  const tradeTaskOrderByAssetId =
    params.tradeTaskOrderByAssetId ?? new Map<string, { orderId: string; siteUrl: string }>();

  for (const asset of params.assets) {
    const externalId = asset.assetExternalId?.trim();
    if (!externalId) {
      continue;
    }
    const listed = Boolean(asset.activeLotId) || asset.status === 'LISTED';
    const deal = params.dealOrderByAssetId.get(externalId);
    const task = tradeTaskOrderByAssetId.get(externalId);
    const reserved = asset.status === 'RESERVED';
    map.set(externalId, {
      inventoryAssetId: asset.id?.trim() || null,
      assetStatus: asset.status?.trim() || null,
      listed,
      lotId: asset.activeLotId ?? null,
      listedPriceMinor: asset.listedPriceMinor ?? null,
      lotUrl:
        asset.activeLotId != null
          ? `${params.siteOrigin}/lots/${asset.activeLotId}`
          : null,
      inActiveDeal:
        reserved ||
        params.dealAssetIds.has(externalId) ||
        Boolean(deal),
      hasActiveTradeTask: tradeTaskAssetIds.has(externalId),
      orderId: deal?.orderId ?? task?.orderId ?? null,
      orderUrl: deal?.siteUrl ?? task?.siteUrl ?? null,
    });
  }

  for (const [assetId, deal] of params.dealOrderByAssetId) {
    const existing = map.get(assetId);
    if (existing) {
      existing.inActiveDeal = true;
      existing.orderId = existing.orderId ?? deal.orderId;
      existing.orderUrl = existing.orderUrl ?? deal.siteUrl;
      continue;
    }
    map.set(assetId, {
      inventoryAssetId: null,
      assetStatus: 'RESERVED',
      listed: false,
      lotId: null,
      listedPriceMinor: null,
      lotUrl: null,
      inActiveDeal: true,
      hasActiveTradeTask: tradeTaskAssetIds.has(assetId),
      orderId: deal.orderId,
      orderUrl: deal.siteUrl,
    });
  }

  for (const [assetId, task] of tradeTaskOrderByAssetId) {
    const existing = map.get(assetId);
    if (existing) {
      existing.hasActiveTradeTask = true;
      existing.orderId = existing.orderId ?? task.orderId;
      existing.orderUrl = existing.orderUrl ?? task.siteUrl;
      continue;
    }
    map.set(assetId, {
      inventoryAssetId: null,
      assetStatus: null,
      listed: false,
      lotId: null,
      listedPriceMinor: null,
      lotUrl: null,
      inActiveDeal: false,
      hasActiveTradeTask: true,
      orderId: task.orderId,
      orderUrl: task.siteUrl,
    });
  }

  return map;
}
