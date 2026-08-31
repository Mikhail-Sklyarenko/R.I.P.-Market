/**
 * Product enrichment for CS2 inventory overlay.
 * Prefer Steam page MAIN world (g_ActiveInventory + same-origin fetch) over
 * isolated-world fetch — Chrome/Steam often return HTTP 500 to extension fetches
 * while the inventory page itself already has (or can load) the data.
 */
import type { InventoryItemSteamFacts } from './inventory-item-enrichment.js';
import { parseWearFromMarketHashName } from './inventory-item-enrichment.js';
import type { EnrichmentInventoryBody } from './inventory-enrichment-data.js';
import { parseInventoryEnrichmentPage } from './inventory-enrichment-data.js';

export type PageEnrichmentLoadResult = {
  facts: InventoryItemSteamFacts[];
  source: 'active_inventory' | 'page_fetch' | 'empty';
  error?: string;
};

const WEAR_SUFFIX_MAP: Record<string, string> = {
  'factory new': 'FN',
  'minimal wear': 'MW',
  'field-tested': 'FT',
  'well-worn': 'WW',
  'battle-scarred': 'BS',
};

function wearFromName(marketHashName: string | null): string | null {
  if (!marketHashName) {
    return null;
  }
  const match = marketHashName.match(/\(([^)]+)\)\s*$/);
  if (!match?.[1]) {
    return null;
  }
  return WEAR_SUFFIX_MAP[match[1].toLowerCase()] ?? match[1];
}

type ActiveInventoryLike = {
  appid?: number | string;
  contextid?: number | string;
  m_appid?: number | string;
  m_contextid?: number | string;
  m_rgAssets?: unknown;
  m_rgDescriptions?: unknown;
  m_rgAssetProperties?: unknown;
  rgInventory?: unknown;
  rgDescriptions?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNestedAssetMap(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  if (!root) {
    return {};
  }
  // Shape A: { "12345": { classid, instanceid } }
  const sample = Object.values(root)[0];
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const sampleRec = sample as Record<string, unknown>;
    if (
      sampleRec.classid != null ||
      sampleRec.assetid != null ||
      sampleRec.id != null
    ) {
      return root;
    }
  }
  // Shape B: { "730_2": { "12345": {...} } } or { "2": { ... } }
  const nested: Record<string, unknown> = {};
  for (const value of Object.values(root)) {
    const child = asRecord(value);
    if (!child) {
      continue;
    }
    Object.assign(nested, child);
  }
  return Object.keys(nested).length > 0 ? nested : root;
}

function readDescriptionMap(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  if (!root) {
    return {};
  }
  const sample = Object.values(root)[0];
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const sampleRec = sample as Record<string, unknown>;
    if (
      sampleRec.market_hash_name != null ||
      sampleRec.market_name != null ||
      sampleRec.classid != null
    ) {
      return root;
    }
  }
  const nested: Record<string, unknown> = {};
  for (const value of Object.values(root)) {
    const child = asRecord(value);
    if (!child) {
      continue;
    }
    Object.assign(nested, child);
  }
  return Object.keys(nested).length > 0 ? nested : root;
}

function readFloatAndSeed(
  assetId: string,
  assetProperties: unknown,
): { floatValue: string | null; paintSeed: number | null } {
  const list = Array.isArray(assetProperties)
    ? assetProperties
    : Object.values(asRecord(assetProperties) ?? {});
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) {
      continue;
    }
    const id = String(row.assetid ?? row.assetId ?? '');
    if (id && id !== assetId) {
      continue;
    }
    const props = Array.isArray(row.asset_properties)
      ? row.asset_properties
      : Array.isArray(row.properties)
        ? row.properties
        : [];
    let floatValue: string | null = null;
    let paintSeed: number | null = null;
    for (const prop of props) {
      const p = asRecord(prop);
      if (!p) {
        continue;
      }
      const propertyId = Number(p.propertyid ?? p.propertyId);
      if (propertyId === 1 && typeof p.float_value === 'string') {
        floatValue = p.float_value;
      }
      if (propertyId === 2 && p.int_value != null) {
        const seed = Number(p.int_value);
        paintSeed = Number.isFinite(seed) ? seed : null;
      }
    }
    if (floatValue != null || paintSeed != null) {
      return { floatValue, paintSeed };
    }
  }
  return { floatValue: null, paintSeed: null };
}

/**
 * Parse Steam CInventory / legacy inventory bags into enrichment facts.
 */
export function factsFromActiveInventoryLike(
  active: ActiveInventoryLike | null | undefined,
): InventoryItemSteamFacts[] {
  if (!active) {
    return [];
  }
  const appId = Number(active.appid ?? active.m_appid ?? 730);
  if (appId !== 730) {
    return [];
  }

  const assets = readNestedAssetMap(
    active.m_rgAssets ?? active.rgInventory ?? null,
  );
  const descriptions = readDescriptionMap(
    active.m_rgDescriptions ?? active.rgDescriptions ?? null,
  );
  const assetProperties = active.m_rgAssetProperties ?? null;

  const facts: InventoryItemSteamFacts[] = [];
  for (const [key, rawAsset] of Object.entries(assets)) {
    const asset = asRecord(rawAsset);
    if (!asset) {
      continue;
    }
    const assetId = String(asset.assetid ?? asset.id ?? key);
    if (!/^\d+$/.test(assetId)) {
      continue;
    }
    const classId = String(asset.classid ?? '');
    const instanceId = String(asset.instanceid ?? '0');
    const desc =
      asRecord(descriptions[`${classId}_${instanceId}`]) ??
      asRecord(descriptions[classId]) ??
      null;
    const marketHashName =
      (typeof desc?.market_hash_name === 'string'
        ? desc.market_hash_name
        : null) ??
      (typeof desc?.market_name === 'string' ? desc.market_name : null) ??
      null;
    const { floatValue, paintSeed } = readFloatAndSeed(
      assetId,
      assetProperties,
    );
    const tradable =
      desc?.tradable === 1 ||
      desc?.tradable === true ||
      desc?.tradable === '1';
    const marketable =
      desc?.marketable === undefined
        ? tradable
        : desc.marketable === 1 ||
          desc.marketable === true ||
          desc.marketable === '1';
    const tradeLockUntil =
      typeof desc?.cache_expiration === 'string'
        ? desc.cache_expiration
        : null;

    facts.push({
      assetId,
      marketHashName,
      floatValue,
      paintSeed,
      wear: parseWearFromMarketHashName(marketHashName) ?? wearFromName(marketHashName),
      tradable,
      marketable,
      tradeLockUntil,
    });
  }
  return facts;
}

export function factsFromEnrichmentApiBody(
  body: EnrichmentInventoryBody,
): InventoryItemSteamFacts[] {
  return parseInventoryEnrichmentPage(body);
}

export function inventoryItemSteamFactsToMap(
  facts: InventoryItemSteamFacts[],
): Map<string, InventoryItemSteamFacts> {
  const map = new Map<string, InventoryItemSteamFacts>();
  for (const fact of facts) {
    map.set(fact.assetId, fact);
  }
  return map;
}
