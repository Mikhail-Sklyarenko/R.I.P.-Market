/**
 * Product foundation for Steam CS2 inventory overlays.
 *
 * Layer model:
 * 1) DOM asset ids on screen → always show overlay + sell CTA
 * 2) Platform inventory (paired) → names, listed/deal badges
 * 3) Steam enrichment (MAIN world / API) → float, wear, tradable truth
 *
 * Never gate the sell CTA on Steam inventory JSON succeeding.
 */
import type {
  InventoryItemPlatformFacts,
  InventoryItemSteamFacts,
} from './inventory-item-enrichment.js';
import {
  CS2_INVENTORY_ITEM_SELECTOR,
  isTradeProtectedCs2Context,
  parseCs2InventoryItemElementId,
  parseWearFromMarketHashName,
} from './inventory-item-enrichment.js';

export function createBaselineSteamFact(
  assetId: string,
  overrides?: Partial<InventoryItemSteamFacts>,
): InventoryItemSteamFacts {
  const marketHashName = overrides?.marketHashName?.trim()
    ? overrides.marketHashName.trim()
    : null;
  return {
    assetId,
    marketHashName,
    floatValue: overrides?.floatValue ?? null,
    paintSeed: overrides?.paintSeed ?? null,
    wear:
      overrides?.wear ?? parseWearFromMarketHashName(marketHashName) ?? null,
    tradable: overrides?.tradable ?? true,
    marketable: overrides?.marketable ?? true,
    tradeLockUntil: overrides?.tradeLockUntil ?? null,
  };
}

/**
 * Merge enrichment onto a baseline. Non-null enrich fields win.
 * Explicit false for tradable/marketable from enrich wins over optimistic true.
 */
export function mergeSteamFact(
  base: InventoryItemSteamFacts,
  enrich: InventoryItemSteamFacts,
): InventoryItemSteamFacts {
  const hasEnrichIdentity = Boolean(
    enrich.marketHashName?.trim() ||
      enrich.floatValue != null ||
      enrich.paintSeed != null ||
      enrich.tradeLockUntil != null,
  );
  const marketHashName =
    enrich.marketHashName?.trim() || base.marketHashName || null;
  return {
    assetId: base.assetId,
    marketHashName,
    floatValue: enrich.floatValue ?? base.floatValue,
    paintSeed: enrich.paintSeed ?? base.paintSeed,
    wear:
      enrich.wear ??
      base.wear ??
      parseWearFromMarketHashName(marketHashName) ??
      null,
    tradable: hasEnrichIdentity ? enrich.tradable : base.tradable,
    marketable: hasEnrichIdentity ? enrich.marketable : base.marketable,
    tradeLockUntil: enrich.tradeLockUntil ?? base.tradeLockUntil,
  };
}

export function mergeSteamFactsMaps(
  ...layers: Array<Map<string, InventoryItemSteamFacts> | null | undefined>
): Map<string, InventoryItemSteamFacts> {
  const out = new Map<string, InventoryItemSteamFacts>();
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    for (const [assetId, fact] of layer) {
      const prev = out.get(assetId);
      out.set(assetId, prev ? mergeSteamFact(prev, fact) : fact);
    }
  }
  return out;
}

function readMarketHashHintFromItemElement(
  item: Element,
): string | null {
  const titled =
    item.getAttribute('data-market-hash-name')?.trim() ||
    item.getAttribute('data-hash-name')?.trim() ||
    null;
  if (titled) {
    return titled;
  }
  // Steam sometimes puts economy descriptor on child img/title.
  const img = item.querySelector('img[title], img[alt]');
  const title = img?.getAttribute('title')?.trim() || img?.getAttribute('alt')?.trim();
  if (title && title.length > 2 && !/^https?:/i.test(title)) {
    return title;
  }
  return null;
}

/**
 * Optimistic facts for every CS2 item currently in the Steam inventory DOM.
 * Supports legacy `item730_*` and modern `730_2_*` / `730_16_*` ids.
 */
export function buildDomBaselineSteamFacts(
  root: ParentNode,
): Map<string, InventoryItemSteamFacts> {
  const map = new Map<string, InventoryItemSteamFacts>();
  const items = root.querySelectorAll(CS2_INVENTORY_ITEM_SELECTOR);
  for (const item of Array.from(items)) {
    const parsed = parseCs2InventoryItemElementId((item as HTMLElement).id);
    if (!parsed) {
      continue;
    }
    const marketHashName = readMarketHashHintFromItemElement(item);
    const tradeProtected = isTradeProtectedCs2Context(parsed.contextId);
    map.set(
      parsed.assetId,
      createBaselineSteamFact(parsed.assetId, {
        marketHashName,
        // Context 16 = Trade Protected — do not pretend tradable.
        tradable: !tradeProtected,
        marketable: !tradeProtected,
        tradeLockUntil: tradeProtected
          ? // Soft signal until Steam enrichment supplies a real unlock time.
            new Date(Date.now() + 7 * 86_400_000).toISOString()
          : null,
      }),
    );
  }
  return map;
}

/**
 * Fold platform marketHashName (from GET /inventory) into steam facts.
 */
export function applyPlatformNamesToSteamFacts(
  steamFacts: Map<string, InventoryItemSteamFacts>,
  platformFacts: Record<string, InventoryItemPlatformFacts>,
): Map<string, InventoryItemSteamFacts> {
  const out = new Map(steamFacts);
  for (const [assetId, platform] of Object.entries(platformFacts)) {
    const name = platform.marketHashName?.trim();
    if (!name) {
      continue;
    }
    const existing = out.get(assetId);
    if (existing) {
      if (!existing.marketHashName) {
        out.set(
          assetId,
          mergeSteamFact(existing, {
            ...existing,
            marketHashName: name,
            wear: parseWearFromMarketHashName(name),
          }),
        );
      }
      continue;
    }
    out.set(
      assetId,
      createBaselineSteamFact(assetId, { marketHashName: name }),
    );
  }
  return out;
}
