/**
 * Build browser-assist payload from Steam overlay facts (content → API).
 */

import type { InventoryItemSteamFacts } from './inventory-item-enrichment.js';

export type BrowserAssistAssetPayload = {
  assetId: string;
  marketHashName: string;
  tradable: boolean;
  marketable: boolean;
  tradeLockUntil: string | null;
  floatValue: string | null;
  paintSeed: number | null;
  wear: string | null;
  iconUrl: string | null;
};

export const MAX_BROWSER_ASSIST_ASSETS = 500;

export function buildBrowserAssistAssetsFromFacts(
  facts: Iterable<InventoryItemSteamFacts>,
  iconByAssetId?: ReadonlyMap<string, string | null>,
): BrowserAssistAssetPayload[] {
  const out: BrowserAssistAssetPayload[] = [];
  for (const fact of facts) {
    const marketHashName = fact.marketHashName?.trim();
    const assetId = fact.assetId?.trim();
    if (!marketHashName || !assetId) {
      continue;
    }
    out.push({
      assetId,
      marketHashName,
      tradable: fact.tradable,
      marketable: fact.marketable,
      tradeLockUntil: fact.tradeLockUntil,
      floatValue: fact.floatValue,
      paintSeed: fact.paintSeed,
      wear: fact.wear,
      iconUrl: iconByAssetId?.get(assetId) ?? null,
    });
    if (out.length >= MAX_BROWSER_ASSIST_ASSETS) {
      break;
    }
  }
  return out;
}
