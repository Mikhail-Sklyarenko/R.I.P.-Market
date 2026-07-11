import type { Lot, ListingSticker } from '../api/types';
import type { ItemDisplaySource } from './item-image';

export type { ListingSticker };

export function resolveLotDisplayItem(
  lot: Lot,
): ItemDisplaySource & { capturedAt?: string | null; stickers?: ListingSticker[] | null } {
  const snapshot = lot.listingSnapshot;
  if (snapshot) {
    return {
      wear: snapshot.wear,
      floatValue: snapshot.floatValue,
      paintSeed: snapshot.paintSeed,
      capturedAt: snapshot.capturedAt,
      stickers: snapshot.stickers ?? [],
      itemDefinition: {
        marketHashName: snapshot.marketHashName,
        weapon: snapshot.weapon,
        rarity: snapshot.rarity,
        iconUrl: snapshot.iconUrl,
      },
    };
  }

  return lot.inventoryAsset;
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
