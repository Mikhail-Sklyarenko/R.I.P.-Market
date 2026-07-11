export type ObservedTradeOfferItem = {
  assetId: string;
  marketHashName: string | null;
};

const SELLER_SLOT_SELECTORS = [
  '#your_slots .item[data-assetid]',
  '#trade_slot_drag_target .item[data-assetid]',
  '#trade_items .item[data-assetid]',
];

const BUYER_RECEIVED_SELECTORS = [
  '#them_slots .item[data-assetid]',
  '.tradeoffer_items_ctn .item[data-assetid]',
  '.tradeoffer_item_list .item[data-assetid]',
  '.tradeoffer .item[data-assetid]',
];

export function parseAssetIdFromElement(element: Element): string | null {
  const dataAssetId = element.getAttribute('data-assetid')?.trim();
  if (dataAssetId) {
    return dataAssetId;
  }

  const elementId = element.id?.trim();
  if (!elementId) {
    return null;
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

export function parseObservedItemFromTradePage(
  role: 'buyer' | 'seller',
): ObservedTradeOfferItem | null {
  const selectors =
    role === 'seller' ? SELLER_SLOT_SELECTORS : BUYER_RECEIVED_SELECTORS;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) {
      continue;
    }
    const assetId = parseAssetIdFromElement(element);
    if (!assetId) {
      continue;
    }
    return {
      assetId,
      marketHashName: parseMarketHashNameFromElement(element),
    };
  }

  return null;
}
