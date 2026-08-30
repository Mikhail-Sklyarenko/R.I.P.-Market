/**
 * Selected-item sell rail — MarketApp / CSFloat parity.
 *
 * Steam puts Community Market Sell in `#iteminfo{0|1}_item_market_actions`.
 * CS2 cell ids: legacy `item730_*` or modern `730_2_*` / `730_16_*`.
 */

import {
  CS2_INVENTORY_ITEM_SELECTOR,
  parseCs2InventoryItemElementId,
  queryCs2InventoryItemByAssetId,
} from './inventory-item-enrichment.js';

export const SELECTED_SELL_RAIL_ID = 'rip-market-selected-sell';

export type SelectedInventoryItemRef = {
  assetId: string;
  marketHashName: string | null;
  contextId: number | null;
};

function isNodeVisuallyShown(node: Element): boolean {
  const el = node as HTMLElement;
  const inline = (el.getAttribute('style') ?? '').toLowerCase();
  if (/display\s*:\s*none/.test(inline)) {
    return false;
  }
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const live = el.style?.display?.toLowerCase();
  if (live === 'none') {
    return false;
  }
  return true;
}

function readNameFromItemElement(item: Element): string | null {
  return (
    item.getAttribute('data-market-hash-name')?.trim() ||
    item.getAttribute('data-hash-name')?.trim() ||
    item.querySelector('img[title], img[alt]')?.getAttribute('title')?.trim() ||
    item.querySelector('img[title], img[alt]')?.getAttribute('alt')?.trim() ||
    null
  );
}

function refFromItemElement(item: Element | null): SelectedInventoryItemRef | null {
  if (!item) {
    return null;
  }
  const parsed = parseCs2InventoryItemElementId((item as HTMLElement).id);
  if (!parsed) {
    return null;
  }
  return {
    assetId: parsed.assetId,
    contextId: parsed.contextId,
    marketHashName: readNameFromItemElement(item),
  };
}

export function findVisibleItemInfoPanel(
  doc: Pick<Document, 'querySelectorAll'>,
): Element | null {
  const panels = Array.from(
    doc.querySelectorAll(
      '#iteminfo0, #iteminfo1, .inventory_page_right .inventory_iteminfo',
    ),
  );
  for (const panel of panels) {
    if (isNodeVisuallyShown(panel)) {
      return panel;
    }
  }
  return panels[0] ?? null;
}

export function findVisibleItemActionsRoot(
  doc: Pick<Document, 'querySelectorAll' | 'querySelector'>,
): Element | null {
  const panel = findVisibleItemInfoPanel(doc);
  if (panel) {
    const market =
      panel.querySelector(
        '[id$="_item_market_actions"], .item_market_actions',
      ) ?? null;
    if (market) {
      return market;
    }
    const actions =
      panel.querySelector('[id$="_item_actions"], .item_actions') ?? null;
    if (actions) {
      return actions;
    }
  }

  const candidates = Array.from(
    doc.querySelectorAll(
      [
        '#iteminfo0_item_market_actions',
        '#iteminfo1_item_market_actions',
        '#iteminfo0 .item_market_actions',
        '#iteminfo1 .item_market_actions',
        '.inventory_iteminfo .item_market_actions',
        '#iteminfo0_item_actions',
        '#iteminfo1_item_actions',
        '#iteminfo0 .item_actions',
        '#iteminfo1 .item_actions',
      ].join(', '),
    ),
  );

  for (const node of candidates) {
    const info = node.closest(
      '#iteminfo0, #iteminfo1, .inventory_iteminfo',
    ) as HTMLElement | null;
    if (info && !isNodeVisuallyShown(info)) {
      continue;
    }
    if (!isNodeVisuallyShown(node)) {
      continue;
    }
    return node;
  }

  return candidates[0] ?? null;
}

export function readSelectedCs2ItemFromDom(
  doc: Pick<Document, 'querySelector' | 'querySelectorAll'>,
  options?: {
    lastClickedAssetId?: string | null;
  },
): SelectedInventoryItemRef | null {
  const activeInfo = refFromItemElement(
    doc.querySelector(`${CS2_INVENTORY_ITEM_SELECTOR}.activeInfo`) ??
      doc.querySelector(`.itemHolder.activeInfo ${CS2_INVENTORY_ITEM_SELECTOR}`) ??
      doc.querySelector(`#inventories ${CS2_INVENTORY_ITEM_SELECTOR}.activeInfo`),
  );
  if (activeInfo) {
    return activeInfo;
  }

  const holderActive = refFromItemElement(
    doc.querySelector(
      `.itemHolder.active ${CS2_INVENTORY_ITEM_SELECTOR}, .itemHolder.hover ${CS2_INVENTORY_ITEM_SELECTOR}`,
    ),
  );
  if (holderActive) {
    return holderActive;
  }

  const lastId = options?.lastClickedAssetId?.trim();
  if (lastId) {
    const fromClick = refFromItemElement(
      queryCs2InventoryItemByAssetId(doc as ParentNode, lastId),
    );
    if (fromClick) {
      return fromClick;
    }
    return { assetId: lastId, marketHashName: null, contextId: null };
  }

  const panel = findVisibleItemInfoPanel(doc);
  const panelName =
    panel
      ?.querySelector(
        '.hover_item_name, h1, #iteminfo0_item_name, #iteminfo1_item_name',
      )
      ?.textContent?.trim() || null;
  if (panelName) {
    for (const item of Array.from(
      doc.querySelectorAll(CS2_INVENTORY_ITEM_SELECTOR),
    )) {
      const name = readNameFromItemElement(item);
      if (name && name === panelName) {
        const ref = refFromItemElement(item);
        if (ref) {
          return ref;
        }
      }
    }
  }

  return null;
}

export function buildSelectedSellRailModel(params: {
  selected: SelectedInventoryItemRef | null;
  connected: boolean;
  siteSafeMode?: boolean;
  label: string;
}): {
  visible: boolean;
  assetId: string | null;
  label: string;
  kind: 'list' | 'pair' | 'blocked';
} {
  if (!params.selected) {
    return { visible: false, assetId: null, label: params.label, kind: 'list' };
  }
  if (!params.connected) {
    return {
      visible: true,
      assetId: params.selected.assetId,
      label: params.label,
      kind: 'pair',
    };
  }
  if (params.siteSafeMode) {
    return {
      visible: true,
      assetId: params.selected.assetId,
      label: 'Сайт offline',
      kind: 'blocked',
    };
  }
  return {
    visible: true,
    assetId: params.selected.assetId,
    label: params.label,
    kind: 'list',
  };
}
