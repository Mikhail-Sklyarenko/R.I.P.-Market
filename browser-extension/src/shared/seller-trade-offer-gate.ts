import { parseObservedItemsFromTradeSlots } from './trade-offer-observed-item.js';

function isDisplayed(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) {
    return false;
  }
  if (element.style.display === 'none' || element.style.visibility === 'hidden') {
    return false;
  }
  return true;
}

/** CS2 inventory panel on Steam's /tradeoffer/new page (not /inventory/). */
export function isCs2InventoryVisibleOnTradeOffer(
  root: ParentNode = document,
): boolean {
  const candidates = [
    root.querySelector<HTMLElement>('#inventory_730_2'),
    root.querySelector<HTMLElement>('#inventory_730_16'),
    ...Array.from(
      root.querySelectorAll<HTMLElement>('#inventories [id^="inventory_730"]'),
    ),
  ].filter((el): el is HTMLElement => Boolean(el));

  return candidates.some(
    (el) => isDisplayed(el) && Boolean(el.querySelector('.item, .itemHolder .item')),
  );
}

export type SellerTradeOfferGateKind = 'need_cs2' | 'need_item' | 'item_ready';

/**
 * What the seller must do on /tradeoffer/new — one state, one instruction.
 */
export function resolveSellerTradeOfferGate(params: {
  root?: ParentNode;
  expectedAssetId?: string | null;
}): SellerTradeOfferGateKind {
  const root = params.root ?? document;
  const inSlots = parseObservedItemsFromTradeSlots('seller', root);
  if (inSlots.length > 0) {
    return 'item_ready';
  }
  if (!isCs2InventoryVisibleOnTradeOffer(root)) {
    return 'need_cs2';
  }
  return 'need_item';
}
