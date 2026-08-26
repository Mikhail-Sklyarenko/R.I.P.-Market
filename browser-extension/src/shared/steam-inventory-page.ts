/**
 * D1: Steam CS2 inventory page detection (app 730).
 * Pure helpers — no DOM mutation. Content script mounts a layer on top only when active.
 */

export const CS2_APP_ID = 730;
export const CS2_CONTEXT_ID = 2;

export type InventoryAppContext = {
  appId: number | null;
  contextId: number | null;
};

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

/** Count Steam item holders currently in the page (for readiness / D2 hooks). */
export function countInventoryItemHolders(
  doc: Pick<Document, 'querySelectorAll'>,
): number {
  return doc.querySelectorAll(
    '.itemHolder:not(.disabled), .inventory_page .itemHolder, #inventories .itemHolder',
  ).length;
}

/** Visible CS2 item holders on the *currently displayed* inventory page(s). */
export function listVisibleInventoryItemHolders(
  doc: Pick<Document, 'querySelectorAll'>,
): Element[] {
  // Prefer the page Steam marks with display:block (avoid matching every
  // pre-rendered .inventory_page — that was O(all pages × 25–50) holders).
  let pages = Array.from(
    doc.querySelectorAll(
      '.inventory_ctn[style*="display: block"] .inventory_page[style*="display: block"], #inventories .inventory_page[style*="display: block"]',
    ),
  );

  if (pages.length === 0) {
    pages = Array.from(
      doc.querySelectorAll(
        '.inventory_ctn[style*="display: block"] .inventory_page',
      ),
    ).filter((page) => (page as HTMLElement).style?.display !== 'none');
  }

  if (pages.length === 0) {
    return Array.from(
      doc.querySelectorAll(
        '.inventory_ctn[style*="display: block"] .itemHolder:not(.disabled):not(.unknown)',
      ),
    );
  }

  const holders: Element[] = [];
  const seen = new Set<Element>();
  for (const root of pages) {
    for (const holder of Array.from(
      root.querySelectorAll('.itemHolder:not(.disabled):not(.unknown)'),
    )) {
      if (!seen.has(holder)) {
        seen.add(holder);
        holders.push(holder);
      }
    }
  }
  return holders;
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
