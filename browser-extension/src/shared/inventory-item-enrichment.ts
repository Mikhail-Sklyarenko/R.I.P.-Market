import type { InventoryPriceHintLike } from './inventory-price-intel.js';
import { resolveInventoryPriceIntel } from './inventory-price-intel.js';

/**
 * D2: CS2 inventory card enrichment — float, wear bar, paint seed, badges.
 * D3: optional R.I.P / Steam / net price strip.
 * Pure helpers; content script only mounts overlays on Steam .itemHolder cells.
 */

export type InventoryBadgeKind =
  | 'listed'
  | 'in_deal'
  | 'trade_locked'
  | 'tradable'
  | 'marketable'
  | 'not_tradable';

export type InventoryBadge = {
  kind: InventoryBadgeKind;
  label: string;
  tone: 'ok' | 'warn' | 'info' | 'muted' | 'accent';
};

export type InventoryItemSteamFacts = {
  assetId: string;
  marketHashName: string | null;
  floatValue: string | null;
  paintSeed: number | null;
  wear: string | null;
  tradable: boolean;
  marketable: boolean;
  tradeLockUntil: string | null;
};

export type InventoryItemPlatformFacts = {
  /** Platform inventory row UUID (for POST /lots). */
  inventoryAssetId: string | null;
  /** Platform inventory status when known (AVAILABLE / LISTED / RESERVED…). */
  assetStatus: string | null;
  /** Market hash name from platform item definition when known. */
  marketHashName: string | null;
  listed: boolean;
  lotId: string | null;
  listedPriceMinor: string | null;
  lotUrl: string | null;
  inActiveDeal: boolean;
  /** Seller has an in-flight extension trade task for this Steam asset. */
  hasActiveTradeTask: boolean;
  orderId: string | null;
  orderUrl: string | null;
};

export type InventoryItemEnrichmentView = {
  assetId: string;
  floatDisplay: string | null;
  wearCode: string | null;
  paintSeedDisplay: string | null;
  wearPointerPercent: number | null;
  tradeLockLabel: string | null;
  badges: InventoryBadge[];
  metaLine: string | null;
  /** D3: R.I.P / Steam / net lines for the card footer. */
  pricePrimary: string | null;
  priceSecondary: string | null;
  priceNet: string | null;
  /** D5: best bid chip (demand), never framed as instant cash. */
  priceBid: string | null;
};

const WEAR_SUFFIX_MAP: Record<string, string> = {
  'factory new': 'FN',
  'minimal wear': 'MW',
  'field-tested': 'FT',
  'well-worn': 'WW',
  'battle-scarred': 'BS',
};

export function parseWearFromMarketHashName(
  marketHashName: string | null | undefined,
): string | null {
  if (!marketHashName) {
    return null;
  }
  const match = marketHashName.match(/\(([^)]+)\)\s*$/);
  if (!match?.[1]) {
    return null;
  }
  return WEAR_SUFFIX_MAP[match[1].toLowerCase()] ?? match[1];
}

export function parseFloatNumber(
  value: string | null | undefined,
): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    return null;
  }
  return numeric;
}

export function formatFloatDisplay(value: number): string {
  const fixed = value.toFixed(8);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '.0');
}

export function wearPointerPercent(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}

export function formatTradeLockLabel(
  tradeLockUntil: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!tradeLockUntil) {
    return null;
  }
  const until = Date.parse(tradeLockUntil);
  if (!Number.isFinite(until)) {
    return null;
  }
  if (until <= nowMs) {
    return null;
  }
  const remainingMs = until - nowMs;
  const days = Math.ceil(remainingMs / 86_400_000);
  if (days <= 1) {
    const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
    return `Hold · ${hours} ч`;
  }
  return `Hold · ${days} дн`;
}

export function formatMoneyMinor(amountMinor: string | null | undefined): string | null {
  if (!amountMinor) {
    return null;
  }
  const value = Number(amountMinor) / 100;
  if (!Number.isFinite(value)) {
    return null;
  }
  return `$${value.toFixed(2)}`;
}

export function resolveInventoryBadges(params: {
  steam: Pick<
    InventoryItemSteamFacts,
    'tradable' | 'marketable' | 'tradeLockUntil'
  >;
  platform?: InventoryItemPlatformFacts | null;
  nowMs?: number;
}): InventoryBadge[] {
  const badges: InventoryBadge[] = [];
  const platform = params.platform;
  const lockLabel = formatTradeLockLabel(
    params.steam.tradeLockUntil,
    params.nowMs,
  );

  if (platform?.listed) {
    const price = formatMoneyMinor(platform.listedPriceMinor);
    badges.push({
      kind: 'listed',
      label: price ? `На R.I.P ${price}` : 'На R.I.P',
      tone: 'accent',
    });
  }

  if (platform?.inActiveDeal) {
    badges.push({
      kind: 'in_deal',
      label: 'В сделке',
      tone: 'warn',
    });
  } else if (platform?.hasActiveTradeTask) {
    badges.push({
      kind: 'in_deal',
      label: 'Обмен идёт',
      tone: 'warn',
    });
  }

  if (lockLabel) {
    badges.push({
      kind: 'trade_locked',
      label: lockLabel,
      tone: 'warn',
    });
  } else if (!params.steam.tradable) {
    // Product: only surface blockers — green "Tradable/Marketable" noise
    // loses to competitors who keep the card chrome for float + sell.
    badges.push({
      kind: 'not_tradable',
      label: 'Нельзя обменять',
      tone: 'muted',
    });
  }

  if (!params.steam.marketable && !lockLabel) {
    badges.push({
      kind: 'marketable',
      label: 'Нельзя на Steam Market',
      tone: 'muted',
    });
  }

  return badges;
}

export function buildInventoryItemEnrichmentView(params: {
  steam: InventoryItemSteamFacts;
  platform?: InventoryItemPlatformFacts | null;
  priceHint?: InventoryPriceHintLike | null;
  nowMs?: number;
}): InventoryItemEnrichmentView {
  const floatNum = parseFloatNumber(params.steam.floatValue);
  const wearCode =
    params.steam.wear ?? parseWearFromMarketHashName(params.steam.marketHashName);
  const badges = resolveInventoryBadges({
    steam: params.steam,
    platform: params.platform,
    nowMs: params.nowMs,
  });

  const floatDisplay = floatNum !== null ? formatFloatDisplay(floatNum) : null;
  const paintSeedDisplay =
    params.steam.paintSeed != null && Number.isFinite(params.steam.paintSeed)
      ? `seed ${params.steam.paintSeed}`
      : null;

  const metaParts = [
    floatDisplay,
    wearCode,
    paintSeedDisplay,
  ].filter(Boolean);

  const price = resolveInventoryPriceIntel({
    hint: params.priceHint,
    listedPriceMinor: params.platform?.listedPriceMinor,
  });

  return {
    assetId: params.steam.assetId,
    floatDisplay,
    wearCode,
    paintSeedDisplay,
    wearPointerPercent: floatNum !== null ? wearPointerPercent(floatNum) : null,
    tradeLockLabel: formatTradeLockLabel(
      params.steam.tradeLockUntil,
      params.nowMs,
    ),
    badges,
    metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
    pricePrimary: price.primaryLine,
    priceSecondary: price.secondaryLine,
    priceNet: price.netLine,
    priceBid: price.bidLine,
  };
}

/** Steam inventory cell id forms (CS2 app 730):
 * - legacy: item730_2_{assetId} / item730_16_{assetId}
 * - modern (2026): 730_2_{assetId} / 730_16_{assetId}
 * Context 16 = Trade Protected inventory bucket.
 */
export const CS2_INVENTORY_APP_ID = 730;
export const CS2_TRADE_PROTECTED_CONTEXT_ID = 16;

export type ParsedCs2InventoryItemId = {
  appId: number;
  contextId: number;
  assetId: string;
};

/**
 * CSS selector for CS2 inventory `.item` nodes (legacy + modern Steam DOM).
 * Prefer scoping under #inventories / active ctn in callers.
 */
export const CS2_INVENTORY_ITEM_SELECTOR =
  '.item[id^="item730_"], .item[id^="730_"]';

export function parseCs2InventoryItemElementId(
  elementId: string | null | undefined,
): ParsedCs2InventoryItemId | null {
  if (!elementId) {
    return null;
  }
  const legacy = elementId.match(/^item(730)_(\d+)_(\d+)$/i);
  if (legacy?.[2] && legacy[3]) {
    return {
      appId: CS2_INVENTORY_APP_ID,
      contextId: Number(legacy[2]),
      assetId: legacy[3],
    };
  }
  const modern = elementId.match(/^(730)_(\d+)_(\d+)$/i);
  if (modern?.[2] && modern[3]) {
    return {
      appId: CS2_INVENTORY_APP_ID,
      contextId: Number(modern[2]),
      assetId: modern[3],
    };
  }
  return null;
}

export function parseAssetIdFromItemElementId(
  elementId: string | null | undefined,
): string | null {
  return parseCs2InventoryItemElementId(elementId)?.assetId ?? null;
}

export function isTradeProtectedCs2Context(contextId: number): boolean {
  return contextId === CS2_TRADE_PROTECTED_CONTEXT_ID;
}

/** Resolve a CS2 .item node for a known asset id across id formats. */
export function queryCs2InventoryItemByAssetId(
  root: ParentNode,
  assetId: string,
): Element | null {
  const trimmed = assetId.trim();
  if (!trimmed) {
    return null;
  }
  return (
    root.querySelector(`#item730_2_${trimmed}`) ??
    root.querySelector(`#item730_16_${trimmed}`) ??
    root.querySelector(`#730_2_${trimmed}`) ??
    root.querySelector(`#730_16_${trimmed}`) ??
    root.querySelector(
      `.item[id="item730_2_${trimmed}"], .item[id="item730_16_${trimmed}"], .item[id="730_2_${trimmed}"], .item[id="730_16_${trimmed}"]`,
    )
  );
}

export function readSteamIdFromDocumentHtml(html: string): string | null {
  const patterns = [
    /g_steamID\s*=\s*"(\d{17})"/,
    /"steamid"\s*:\s*"(\d{17})"/,
    /UserYou\.SetSteamId\(\s*"(\d{17})"\s*\)/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vanity /id/ inventory pages often inject g_steamID after first paint.
 * Poll briefly before falling back to profile redirect.
 */
export async function waitForSteamIdInDocument(params: {
  getHtml: () => string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<string | null> {
  const timeoutMs = params.timeoutMs ?? 2500;
  const intervalMs = params.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const id = readSteamIdFromDocumentHtml(params.getHtml());
    if (id) {
      return id;
    }
    await delayMs(intervalMs);
  }
  return readSteamIdFromDocumentHtml(params.getHtml());
}

/**
 * Resolve SteamID64 for the open inventory page (profiles path, g_steamID, or /my/profile/).
 */
export async function resolveInventoryPageSteamId(params: {
  pathname: string;
  getHtml: () => string;
  fetchImpl?: typeof fetch;
  waitTimeoutMs?: number;
  waitIntervalMs?: number;
}): Promise<string | null> {
  const fromPath = params.pathname.match(/\/profiles\/(\d{17})/);
  if (fromPath?.[1]) {
    return fromPath[1];
  }

  const immediate = readSteamIdFromDocumentHtml(params.getHtml());
  if (immediate) {
    return immediate;
  }

  const waited = await waitForSteamIdInDocument({
    getHtml: params.getHtml,
    timeoutMs: params.waitTimeoutMs ?? 2500,
    intervalMs: params.waitIntervalMs ?? 100,
  });
  if (waited) {
    return waited;
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl('https://steamcommunity.com/my/profile/', {
      credentials: 'include',
      redirect: 'follow',
    });
    return response.url.match(/profiles\/(\d{17})/)?.[1] ?? null;
  } catch {
    return null;
  }
}
