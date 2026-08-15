import type { Lot, ListingSticker } from '../api/types';
import type { ItemDisplaySource } from './item-image';

export type { ListingSticker };

function hasFloatValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric);
}

/**
 * Prefer frozen listing snapshot, but fall back to live inventory fields when
 * Steam omitted float/seed at list time and a later sync filled them in.
 */
export function resolveLotDisplayItem(
  lot: Lot,
): ItemDisplaySource & { capturedAt?: string | null; stickers?: ListingSticker[] | null } {
  const snapshot = lot.listingSnapshot;
  const asset = lot.inventoryAsset;

  if (!snapshot) {
    return asset;
  }

  const snapshotStickers = snapshot.stickers ?? [];
  const assetStickers = asset.stickers ?? [];

  return {
    wear: snapshot.wear ?? asset.wear ?? null,
    floatValue: hasFloatValue(snapshot.floatValue)
      ? snapshot.floatValue
      : (asset.floatValue ?? null),
    paintSeed: snapshot.paintSeed ?? asset.paintSeed ?? null,
    capturedAt: snapshot.capturedAt,
    stickers: snapshotStickers.length > 0 ? snapshotStickers : assetStickers,
    itemDefinition: {
      marketHashName: snapshot.marketHashName || asset.itemDefinition.marketHashName,
      weapon: snapshot.weapon ?? asset.itemDefinition.weapon,
      rarity: snapshot.rarity ?? asset.itemDefinition.rarity,
      iconUrl: snapshot.iconUrl ?? asset.itemDefinition.iconUrl,
    },
  };
}

export function formatDataTimestamp(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString();
}

export function isListableMarketHashName(marketHashName: string): boolean {
  return !/(?:Service Medal|Veteran Coin|Birthday Coin|Global Offensive Badge|Loyalty Badge|Premier Season|Operation Coin|Ten Year Veteran)/i.test(
    marketHashName.trim(),
  );
}
