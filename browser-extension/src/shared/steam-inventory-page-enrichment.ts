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

/**
 * Self-contained MAIN-world loader (serialized into the Steam page).
 * Do not close over imports — chrome.scripting.executeScript clones this function.
 */
export async function loadCs2EnrichmentFactsInPageMain(
  steamIdHint: string | null,
): Promise<PageEnrichmentLoadResult> {
  const WEAR_MAP: Record<string, string> = {
    'factory new': 'FN',
    'minimal wear': 'MW',
    'field-tested': 'FT',
    'well-worn': 'WW',
    'battle-scarred': 'BS',
  };

  function wearOf(name: string | null): string | null {
    if (!name) {
      return null;
    }
    const match = name.match(/\(([^)]+)\)\s*$/);
    if (!match?.[1]) {
      return null;
    }
    return WEAR_MAP[match[1].toLowerCase()] ?? match[1];
  }

  function record(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  function flattenAssetBag(raw: unknown): Record<string, unknown> {
    const root = record(raw);
    if (!root) {
      return {};
    }
    const first = Object.values(root)[0];
    const firstRec = record(first);
    if (
      firstRec &&
      (firstRec.classid != null || firstRec.assetid != null || firstRec.id != null)
    ) {
      return root;
    }
    const nested: Record<string, unknown> = {};
    for (const value of Object.values(root)) {
      const child = record(value);
      if (child) {
        Object.assign(nested, child);
      }
    }
    return Object.keys(nested).length > 0 ? nested : root;
  }

  function flattenDescBag(raw: unknown): Record<string, unknown> {
    const root = record(raw);
    if (!root) {
      return {};
    }
    const first = Object.values(root)[0];
    const firstRec = record(first);
    if (
      firstRec &&
      (firstRec.market_hash_name != null ||
        firstRec.market_name != null ||
        firstRec.classid != null)
    ) {
      return root;
    }
    const nested: Record<string, unknown> = {};
    for (const value of Object.values(root)) {
      const child = record(value);
      if (child) {
        Object.assign(nested, child);
      }
    }
    return Object.keys(nested).length > 0 ? nested : root;
  }

  function floatSeed(
    assetId: string,
    assetProperties: unknown,
  ): { floatValue: string | null; paintSeed: number | null } {
    const list = Array.isArray(assetProperties)
      ? assetProperties
      : Object.values(record(assetProperties) ?? {});
    for (const entry of list) {
      const row = record(entry);
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
        const p = record(prop);
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

  function factsFromActive(active: Record<string, unknown> | null): InventoryItemSteamFacts[] {
    if (!active) {
      return [];
    }
    const appId = Number(active.appid ?? active.m_appid ?? 730);
    if (appId !== 730) {
      return [];
    }
    const assets = flattenAssetBag(active.m_rgAssets ?? active.rgInventory);
    const descriptions = flattenDescBag(
      active.m_rgDescriptions ?? active.rgDescriptions,
    );
    const assetProperties = active.m_rgAssetProperties;
    const out: InventoryItemSteamFacts[] = [];
    for (const [key, rawAsset] of Object.entries(assets)) {
      const asset = record(rawAsset);
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
        record(descriptions[`${classId}_${instanceId}`]) ??
        record(descriptions[classId]);
      const marketHashName =
        (typeof desc?.market_hash_name === 'string'
          ? desc.market_hash_name
          : null) ??
        (typeof desc?.market_name === 'string' ? desc.market_name : null) ??
        null;
      const { floatValue, paintSeed } = floatSeed(assetId, assetProperties);
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
      out.push({
        assetId,
        marketHashName,
        floatValue,
        paintSeed,
        wear: wearOf(marketHashName),
        tradable,
        marketable,
        tradeLockUntil:
          typeof desc?.cache_expiration === 'string'
            ? desc.cache_expiration
            : null,
      });
    }
    return out;
  }

  function factsFromBody(body: {
    success?: number;
    assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
    descriptions?: Array<{
      classid: string;
      instanceid: string;
      market_hash_name?: string;
      market_name?: string;
      tradable?: number;
      marketable?: number;
      cache_expiration?: string;
    }>;
    asset_properties?: unknown;
    error?: string;
  }): InventoryItemSteamFacts[] {
    if (body.success === 15) {
      throw new Error('Steam inventory is private');
    }
    if (body.success === 0) {
      throw new Error(body.error ?? 'Steam inventory unavailable');
    }
    const descriptions = new Map<
      string,
      {
        market_hash_name?: string;
        market_name?: string;
        tradable?: number;
        marketable?: number;
        cache_expiration?: string;
      }
    >();
    for (const description of body.descriptions ?? []) {
      descriptions.set(`${description.classid}_${description.instanceid}`, description);
    }
    return (body.assets ?? []).map((asset) => {
      const assetId = String(asset.assetid);
      const meta = descriptions.get(`${asset.classid}_${asset.instanceid}`);
      const marketHashName =
        meta?.market_hash_name ?? meta?.market_name ?? null;
      const { floatValue, paintSeed } = floatSeed(assetId, body.asset_properties);
      const tradable = meta?.tradable === 1;
      const marketable =
        meta?.marketable === undefined ? tradable : meta.marketable === 1;
      return {
        assetId,
        marketHashName,
        floatValue,
        paintSeed,
        wear: wearOf(marketHashName),
        tradable,
        marketable,
        tradeLockUntil: meta?.cache_expiration ?? null,
      };
    });
  }

  async function resolveSteamId(): Promise<string | null> {
    if (steamIdHint && /^\d{17}$/.test(steamIdHint)) {
      return steamIdHint;
    }
    const win = window as unknown as {
      g_steamID?: string;
      g_ActiveUser?: { steamid?: string };
    };
    if (win.g_steamID && /^\d{17}$/.test(win.g_steamID)) {
      return win.g_steamID;
    }
    if (win.g_ActiveUser?.steamid && /^\d{17}$/.test(win.g_ActiveUser.steamid)) {
      return win.g_ActiveUser.steamid;
    }
    const fromPath = window.location.pathname.match(/\/profiles\/(\d{17})/);
    if (fromPath?.[1]) {
      return fromPath[1];
    }
    try {
      const response = await fetch('https://steamcommunity.com/my/profile/', {
        credentials: 'include',
        redirect: 'follow',
      });
      return response.url.match(/profiles\/(\d{17})/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async function fetchWithRetry(
    steamId: string,
    startAssetId?: string,
  ): Promise<Response> {
    const url = new URL(
      `https://steamcommunity.com/inventory/${steamId}/730/2`,
    );
    url.searchParams.set('l', 'english');
    url.searchParams.set('count', '500');
    if (startAssetId) {
      url.searchParams.set('start_assetid', startAssetId);
    }
    let last: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(url.toString(), {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Referer: `https://steamcommunity.com/profiles/${steamId}/inventory/`,
        },
      });
      last = response;
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    return last!;
  }

  try {
    const win = window as unknown as {
      g_ActiveInventory?: Record<string, unknown>;
    };
    const fromActive = factsFromActive(win.g_ActiveInventory ?? null);
    if (fromActive.length > 0) {
      return { facts: fromActive, source: 'active_inventory' };
    }

    const steamId = await resolveSteamId();
    if (!steamId) {
      return {
        facts: [],
        source: 'empty',
        error: 'Steam ID not found on inventory page',
      };
    }

    const merged = new Map<string, InventoryItemSteamFacts>();
    let startAssetId: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const response = await fetchWithRetry(steamId, startAssetId);
      if (!response.ok) {
        throw new Error(`Inventory HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        success?: number;
        assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
        descriptions?: Array<{
          classid: string;
          instanceid: string;
          market_hash_name?: string;
          market_name?: string;
          tradable?: number;
          marketable?: number;
          cache_expiration?: string;
        }>;
        asset_properties?: unknown;
        more_items?: number;
        last_assetid?: string;
        error?: string;
      };
      for (const fact of factsFromBody(body)) {
        merged.set(fact.assetId, fact);
      }
      if (!body.more_items || !body.last_assetid) {
        break;
      }
      startAssetId = body.last_assetid;
    }

    const facts = [...merged.values()];
    if (facts.length === 0) {
      return { facts: [], source: 'empty', error: 'Steam inventory empty' };
    }
    return { facts, source: 'page_fetch' };
  } catch (error) {
    return {
      facts: [],
      source: 'empty',
      error: error instanceof Error ? error.message : 'Inventory page load failed',
    };
  }
}
