export type ObservedTradeOfferItem = {
  assetId: string;
  marketHashName: string | null;
};

/** Seller is putting items into the offer on /tradeoffer/new. */
const SELLER_SLOT_ROOTS = [
  '#your_slots',
  '#trade_offer_your_slots',
];

/** Buyer is looking at items they receive (existing offer page). */
const BUYER_SLOT_ROOTS = [
  '#them_slots',
  '#trade_theirs',
  // Prefer the "their items" column — avoid broad wrappers that include both sides.
  '.tradeoffer_items.primary .tradeoffer_item_list',
  '.tradeoffer_items.primary',
];

export function parseAssetIdFromElement(element: Element): string | null {
  const dataAssetId = element.getAttribute('data-assetid')?.trim();
  if (dataAssetId) {
    return dataAssetId;
  }

  const elementId = element.id?.trim() ?? '';
  const steamItem = elementId.match(/^(?:item|asset)_?730_\d+_(\d+)/i);
  if (steamItem?.[1]) {
    return steamItem[1];
  }

  const suffixMatch = elementId.match(/_(\d{8,})$/);
  return suffixMatch?.[1] ?? null;
}

export function parseMarketHashNameFromElement(element: Element): string | null {
  const title = element.getAttribute('title')?.trim();
  if (title) {
    return title;
  }

  const image = element.querySelector('img');
  const alt = image?.getAttribute('alt')?.trim();
  if (alt) {
    return alt;
  }

  return null;
}

export function detectTradePageRole(pathname: string): 'buyer' | 'seller' {
  return pathname.includes('/tradeoffer/new') ? 'seller' : 'buyer';
}

function isInsideInventoryBrowser(element: Element): boolean {
  return Boolean(element.closest('#inventories, #inventory_box, .inventory_ctn'));
}

/**
 * Items already in the trade offer boxes — not the inventory grid on the left.
 * Steam often uses `id="item730_2_{assetId}"` without `data-assetid`.
 */
export function parseObservedItemsFromTradeSlots(
  role: 'buyer' | 'seller',
  root: ParentNode = document,
): ObservedTradeOfferItem[] {
  const roots = role === 'seller' ? SELLER_SLOT_ROOTS : BUYER_SLOT_ROOTS;
  const found: ObservedTradeOfferItem[] = [];
  const seen = new Set<string>();

  for (const selector of roots) {
    const container = root.querySelector(selector);
    if (!container) {
      continue;
    }
    for (const element of Array.from(container.querySelectorAll('.item'))) {
      if (isInsideInventoryBrowser(element)) {
        continue;
      }
      const assetId = parseAssetIdFromElement(element);
      if (!assetId || seen.has(assetId)) {
        continue;
      }
      seen.add(assetId);
      found.push({
        assetId,
        marketHashName: parseMarketHashNameFromElement(element),
      });
    }
    if (found.length > 0) {
      return found;
    }
  }

  return found;
}

export function parseObservedItemFromTradePage(
  role: 'buyer' | 'seller',
  root: ParentNode = document,
): ObservedTradeOfferItem | null {
  return parseObservedItemsFromTradeSlots(role, root)[0] ?? null;
}
