import { fetchAllSteamInventoryPages } from '../providers/inventory/steam-inventory.client';
import { parseSteamInventoryResponse } from '../providers/inventory/steam-inventory.parser';

export type AssetObservation = {
  assetId: string;
  contextId: '2' | '16';
  appId: number;
  classId: string;
  instanceId: string;
  marketHashName: string;
  floatValue: string | null;
  paintSeed: number | null;
  stickers: unknown;
};
export type InventoryObservation = {
  fetchedAt: string;
  assets: AssetObservation[];
};
export type InventoryBaseline = {
  seller: InventoryObservation;
  buyer: InventoryObservation;
  original: AssetObservation;
};

/** Verification uses complete, fresh server reads; never listing/cache/client rows. */
export async function observeSteamInventory(
  steamId: string,
): Promise<InventoryObservation> {
  const assets: AssetObservation[] = [];
  for (const contextId of ['2', '16'] as const) {
    const response = await fetchAllSteamInventoryPages(
      steamId,
      undefined,
      contextId,
    );
    if (response.more_items || response.success !== 1)
      throw new Error('INVENTORY_INCOMPLETE');
    const parsed = parseSteamInventoryResponse(response);
    if (parsed.length !== (response.assets ?? []).length)
      throw new Error('INVENTORY_METADATA_INCOMPLETE');
    for (const [index, item] of parsed.entries()) {
      const raw = response.assets![index];
      if (
        raw.appid !== 730 ||
        raw.contextid !== contextId ||
        !/^[1-9][0-9]*$/.test(raw.assetid)
      )
        throw new Error('INVENTORY_CONTEXT_INVALID');
      assets.push({
        assetId: item.assetExternalId,
        contextId,
        appId: 730,
        classId: item.classExternalId,
        instanceId: item.instanceExternalId,
        marketHashName: item.marketHashName,
        floatValue: item.floatValue,
        paintSeed: item.paintSeed,
        stickers: item.stickers,
      });
    }
  }
  const keys = assets.map((asset) => `${asset.contextId}:${asset.assetId}`);
  if (new Set(keys).size !== keys.length)
    throw new Error('INVENTORY_DUPLICATE');
  return { fetchedAt: new Date().toISOString(), assets };
}

export function strongFingerprintMatches(
  a: AssetObservation,
  b: AssetObservation,
): boolean {
  // CS2 class/name alone are not unique. Require all available stable attributes,
  // including exact float + seed for this conservative first skin implementation.
  return (
    a.appId === 730 &&
    b.appId === 730 &&
    !!a.classId &&
    a.classId === b.classId &&
    !!a.instanceId &&
    a.instanceId === b.instanceId &&
    !!a.marketHashName &&
    a.marketHashName === b.marketHashName &&
    typeof a.floatValue === 'string' &&
    typeof b.floatValue === 'string' &&
    a.floatValue.trim() !== '' &&
    b.floatValue.trim() !== '' &&
    Number(a.floatValue) >= 0 &&
    Number(a.floatValue) <= 1 &&
    Number.isFinite(Number(a.floatValue)) &&
    Number(a.floatValue) === Number(b.floatValue) &&
    a.paintSeed !== null &&
    Number.isInteger(a.paintSeed) &&
    a.paintSeed >= 0 &&
    a.paintSeed === b.paintSeed &&
    JSON.stringify(a.stickers) === JSON.stringify(b.stickers)
  );
}

export function mapInventoryDelivery(
  baseline: InventoryBaseline | null,
  seller: InventoryObservation,
  buyer: InventoryObservation,
  originalId: string,
  receiptMapping?: { assetId: string; contextId: string },
): {
  result:
    | 'confirmed'
    | 'pending'
    | 'seller_still_holds'
    | 'ambiguous'
    | 'unknown';
  asset?: AssetObservation;
  method?: 'STEAM_RECEIPT' | 'INVENTORY_DELTA';
} {
  if (seller.assets.some((asset) => asset.assetId === originalId))
    return { result: 'seller_still_holds' };
  if (receiptMapping) {
    const candidates = buyer.assets.filter(
      (asset) =>
        asset.assetId === receiptMapping.assetId &&
        asset.contextId === receiptMapping.contextId,
    );
    return candidates.length === 1
      ? { result: 'confirmed', asset: candidates[0], method: 'STEAM_RECEIPT' }
      : { result: candidates.length > 1 ? 'ambiguous' : 'pending' };
  }
  if (!baseline || baseline.original.assetId !== originalId)
    return { result: 'unknown' };
  if (
    Date.parse(seller.fetchedAt) <= Date.parse(baseline.seller.fetchedAt) ||
    Date.parse(buyer.fetchedAt) <= Date.parse(baseline.buyer.fetchedAt)
  )
    return { result: 'unknown' };
  // Compare IDs across both contexts: an existing protected item moving to context 2 is not a gain.
  const before = new Set(baseline.buyer.assets.map((asset) => asset.assetId));
  const candidates = buyer.assets.filter(
    (asset) =>
      !before.has(asset.assetId) &&
      strongFingerprintMatches(baseline.original, asset),
  );
  if (candidates.length > 1) return { result: 'ambiguous' };
  if (!candidates.length) return { result: 'pending' };
  return {
    result: 'confirmed',
    asset: candidates[0],
    method: 'INVENTORY_DELTA',
  };
}
