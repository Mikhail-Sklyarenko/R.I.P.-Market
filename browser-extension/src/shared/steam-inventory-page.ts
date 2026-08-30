/**
 * D1: Steam CS2 inventory page detection (app 730).
 * Pure helpers — no DOM mutation. Content script mounts a layer on top only when active.
 *
 * Product contract for card overlays:
 * - Paint targets = visible CS2 cells (`item730_*` legacy OR modern `730_2_*` / `730_16_*`).
 * - Context 16 = Trade Protected bucket (still painted; sell gated honestly).
 * - Never depend on Steam using inline `style="display: block"`.
 * - Host bar count and overlay paint share the same visibility model.
 */

import {
  CS2_INVENTORY_ITEM_SELECTOR,
  parseCs2InventoryItemElementId,
} from './inventory-item-enrichment.js';

export const CS2_APP_ID = 730;
export const CS2_CONTEXT_ID = 2;
export const CS2_TRADE_PROTECTED_CONTEXT_ID = 16;

export type InventoryAppContext = {
  appId: number | null;
  contextId: number | null;
};

type InventoryDomQuery = Pick<Document, 'querySelector' | 'querySelectorAll'>;

/** Path is a Steam inventory page (any game). */
export function isSteamInventoryPath(pathname: string): boolean {
  return /\/inventory\/?/i.test(pathname);
}

/**
 * Parse `#730_2`, `#730`, `#!730_2`, or query-ish hashes Steam may use.
 */
export function parseInventoryAppContext(hash: string): InventoryAppContext {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const cleaned = raw.replace(/^!/, '').trim();
  if (!cleaned) {
    return { appId: null, contextId: null };
  }

  // Common: 730_2 or 730_2_filters...
  const underscored = cleaned.match(/^(\d+)(?:_(\d+))?/);
  if (underscored) {
    return {
      appId: Number(underscored[1]),
      contextId: underscored[2] ? Number(underscored[2]) : null,
    };
  }

  return { appId: null, contextId: null };
}

/**
 * Steam marks the active game tab as `#inventory_link_{appId}` with class `active`.
 */
export function readActiveInventoryAppIdFromDom(
  doc: Pick<Document, 'querySelector'>,
): number | null {
  const activeTab = doc.querySelector(
    '.games_list_tab.active[id^="inventory_link_"], a.games_list_tab.active[href*="inventory"]',
  );
  if (activeTab) {
    const idMatch = activeTab.id?.match(/inventory_link_(\d+)/i);
    if (idMatch) {
      return Number(idMatch[1]);
    }
    const href = activeTab.getAttribute('href') ?? '';
    const hrefMatch = href.match(/#(\d+)(?:_(\d+))?/);
    if (hrefMatch) {
      return Number(hrefMatch[1]);
    }
  }

  const activePage = doc.querySelector(
    '[id^="inventory_"][id$="_0"].inventory_ctn, .inventory_ctn[style*="display: block"], .inventory_ctn:not([style*="display: none"])',
  );
  if (activePage?.id) {
    const pageMatch = activePage.id.match(/^inventory_(\d+)_/i);
    if (pageMatch) {
      return Number(pageMatch[1]);
    }
  }

  return null;
}

/**
 * True when the user is on inventory and CS2 (730) is the active context.
 * Prefer hash; if hash empty, fall back to Steam game tab DOM.
 */
export function isCs2InventoryActive(params: {
  pathname: string;
  hash: string;
  document?: Pick<Document, 'querySelector'> | null;
}): boolean {
  if (!isSteamInventoryPath(params.pathname)) {
    return false;
  }

  const fromHash = parseInventoryAppContext(params.hash);
  if (fromHash.appId === CS2_APP_ID) {
    return true;
  }
  if (fromHash.appId !== null && fromHash.appId !== CS2_APP_ID) {
    return false;
  }

  if (params.document) {
    const fromDom = readActiveInventoryAppIdFromDom(params.document);
    if (fromDom === CS2_APP_ID) {
      return true;
    }
    if (fromDom !== null) {
      return false;
    }
  }

  // Inventory URL without a clear CS2 signal — wait for hash/DOM (avoid TF2 false positives).
  return false;
}

export function buildCs2InventoryHash(
  contextId: number = CS2_CONTEXT_ID,
): string {
  return `#${CS2_APP_ID}_${contextId}`;
}

function isHtmlElement(node: Element): node is HTMLElement {
  return typeof (node as HTMLElement).style !== 'undefined';
}

/**
 * Visibility without relying on Steam's optional inline display:block.
 * Hidden = explicit none / Steam's inventory_page inactive pattern.
 * Prefer getComputedStyle when the runtime provides a live document.
 */
export function isSteamInventoryNodeVisuallyShown(
  node: Element,
  getComputed?: typeof getComputedStyle,
): boolean {
  if (!isHtmlElement(node)) {
    return true;
  }

  const inline = (node.getAttribute('style') ?? '').toLowerCase();
  if (/display\s*:\s*none/.test(inline)) {
    return false;
  }
  if (node.hidden || node.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (node.classList.contains('inactive') || node.classList.contains('hidden')) {
    return false;
  }

  // Steam sometimes sets display via element.style without attribute serialization
  // matching our attribute check above — trust the live style object.
  const liveDisplay = node.style?.display?.toLowerCase();
  if (liveDisplay === 'none') {
    return false;
  }

  if (getComputed) {
    try {
      const computed = getComputed(node);
      if (computed.display === 'none' || computed.visibility === 'hidden') {
        return false;
      }
    } catch {
      // jsdom / detached nodes — ignore computed
    }
  }

  return true;
}

/**
 * Canonical CS2 inventory container: `#inventory_730_2`, `#inventory_730_16`,
 * or any ctn that already hosts CS2 item cells (modern Steam may omit ids).
 */
export function findCs2InventoryContainer(
  doc: Pick<Document, 'querySelector' | 'querySelectorAll'>,
): Element | null {
  const byId =
    doc.querySelector(`#inventory_${CS2_APP_ID}_${CS2_CONTEXT_ID}`) ??
    doc.querySelector(
      `#inventory_${CS2_APP_ID}_${CS2_TRADE_PROTECTED_CONTEXT_ID}`,
    ) ??
    doc.querySelector(`[id^="inventory_${CS2_APP_ID}_"]`);
  if (byId) {
    return byId;
  }

  const containers = Array.from(
    doc.querySelectorAll('.inventory_ctn, #inventories > div, #inventories'),
  );
  for (const container of containers) {
    if (container.querySelector(CS2_INVENTORY_ITEM_SELECTOR)) {
      return container;
    }
  }
  return null;
}

function listInventoryPages(root: Element): Element[] {
  const pages = Array.from(root.querySelectorAll('.inventory_page'));
  if (pages.length > 0) {
    return pages;
  }
  return [root];
}

export type PaintableCs2InventoryCell = {
  holder: Element;
  item: Element;
  assetId: string;
  contextId: number;
};

function resolveHolderForItem(item: Element): Element | null {
  return (
    item.closest('.itemHolder') ??
    (item.parentElement?.classList.contains('itemHolder')
      ? item.parentElement
      : item.parentElement)
  );
}

/**
 * Item-first paint targets — product source of truth.
 * Supports legacy `item730_*` and modern `730_2_*` / `730_16_*` Steam ids.
 */
export function listPaintableCs2InventoryCells(
  doc: InventoryDomQuery,
  options?: {
    getComputedStyle?: typeof getComputedStyle;
  },
): PaintableCs2InventoryCell[] {
  const getComputed =
    options?.getComputedStyle ??
    (typeof globalThis.getComputedStyle === 'function'
      ? globalThis.getComputedStyle.bind(globalThis)
      : undefined);

  const cs2Root = findCs2InventoryContainer(doc);
  const searchRoots: Element[] = [];

  if (cs2Root) {
    const pages = listInventoryPages(cs2Root);
    const shownPages = pages.filter((page) =>
      isSteamInventoryNodeVisuallyShown(page, getComputed),
    );
    const pageRoots =
      shownPages.length > 0
        ? shownPages
        : pages.filter((page) =>
            page.querySelector(CS2_INVENTORY_ITEM_SELECTOR),
          );
    if (pageRoots.length > 0) {
      searchRoots.push(...pageRoots);
    } else {
      searchRoots.push(cs2Root);
    }
  } else {
    const inventories = doc.querySelector('#inventories');
    if (inventories) {
      searchRoots.push(inventories as Element);
    }
  }

  if (searchRoots.length === 0) {
    return [];
  }

  const cells: PaintableCs2InventoryCell[] = [];
  const seen = new Set<string>();

  const pushItem = (item: Element) => {
    const parsed = parseCs2InventoryItemElementId((item as HTMLElement).id);
    if (!parsed) {
      return;
    }
    const holder = resolveHolderForItem(item);
    if (!holder) {
      return;
    }
    if (
      holder.classList.contains('disabled') ||
      holder.classList.contains('unknown')
    ) {
      return;
    }
    if (seen.has(parsed.assetId)) {
      return;
    }
    seen.add(parsed.assetId);
    cells.push({
      holder,
      item,
      assetId: parsed.assetId,
      contextId: parsed.contextId,
    });
  };

  for (const root of searchRoots) {
    for (const item of Array.from(
      root.querySelectorAll(CS2_INVENTORY_ITEM_SELECTOR),
    )) {
      const page = item.closest('.inventory_page');
      if (page && !isSteamInventoryNodeVisuallyShown(page, getComputed)) {
        continue;
      }
      pushItem(item);
    }
  }

  if (cells.length === 0) {
    for (const item of Array.from(
      doc.querySelectorAll(
        `#inventories ${CS2_INVENTORY_ITEM_SELECTOR}, ${CS2_INVENTORY_ITEM_SELECTOR}`,
      ),
    )) {
      const page = item.closest('.inventory_page') as HTMLElement | null;
      if (page) {
        const pageStyle = (page.getAttribute('style') ?? '').toLowerCase();
        if (
          /display\s*:\s*none/.test(pageStyle) ||
          page.style?.display === 'none'
        ) {
          continue;
        }
      }
      pushItem(item);
    }
  }

  return cells;
}

/**
 * Visible CS2 item holders — delegates to {@link listPaintableCs2InventoryCells}.
 */
export function listVisibleInventoryItemHolders(
  doc: InventoryDomQuery,
  options?: {
    getComputedStyle?: typeof getComputedStyle;
  },
): Element[] {
  return listPaintableCs2InventoryCells(doc, options).map((cell) => cell.holder);
}

/** Count Steam item holders currently in the page (for readiness / D2 hooks). */
export function countInventoryItemHolders(
  doc: Pick<Document, 'querySelectorAll'>,
): number {
  return doc.querySelectorAll(
    '.itemHolder:not(.disabled), .inventory_page .itemHolder, #inventories .itemHolder',
  ).length;
}

/**
 * Host-bar / readiness count aligned with overlay paint targets.
 * Prefer this over {@link countInventoryItemHolders} when reporting CS2 UX state.
 */
export function countVisibleCs2InventoryItemHolders(
  doc: InventoryDomQuery,
  options?: {
    getComputedStyle?: typeof getComputedStyle;
  },
): number {
  return listPaintableCs2InventoryCells(doc, options).length;
}

export function siteOriginFromApiBaseUrl(apiBaseUrl?: string | null): string {
  if (!apiBaseUrl) {
    return 'https://p2pcs.ru';
  }
  return apiBaseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

export function siteSellInventoryUrl(apiBaseUrl?: string | null): string {
  return `${siteOriginFromApiBaseUrl(apiBaseUrl)}/sell/inventory`;
}

export function siteAccountUrl(apiBaseUrl?: string | null): string {
  return `${siteOriginFromApiBaseUrl(apiBaseUrl)}/account`;
}

export function siteListingsPageUrl(apiBaseUrl?: string | null): string {
  return `${siteOriginFromApiBaseUrl(apiBaseUrl)}/deals?tab=listings`;
}
