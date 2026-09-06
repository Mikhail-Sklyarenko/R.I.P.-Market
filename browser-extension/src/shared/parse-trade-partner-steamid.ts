/**
 * Parse the trade-offer counterparty SteamID64 from the Steam page DOM / URL.
 * Used by Deal Shield partner verification (1b).
 */
import {
  accountIdToSteamId64,
  extractSteamId64FromHref,
  isRealSteamId64,
} from './steam-id64.js';

const PARTNER_LINK_SELECTORS = [
  '.trade_partner_header a[href*="/profiles/"]',
  '.trade_partner_header a[href*="/id/"]',
  '.tradeoffer_header a[href*="/profiles/"]',
  '.tradeoffer_header a[href*="/id/"]',
  '#trade_them a[href*="/profiles/"]',
  '#trade_them a[href*="/id/"]',
  '.trade_partner_info_block a[href*="/profiles/"]',
  '.trade_partner_info_block a[href*="/id/"]',
  'a.trade_partner_headline_name[href*="/profiles/"]',
  'a.trade_partner_headline_name[href*="/id/"]',
  '.playerAvatar a[href*="/profiles/"]',
  '.playerAvatar a[href*="/id/"]',
];

const PARTNER_MINIPROFILE_SELECTORS = [
  '.trade_partner_header [data-miniprofile]',
  '.tradeoffer_header [data-miniprofile]',
  '#trade_them [data-miniprofile]',
  '.trade_partner_info_block [data-miniprofile]',
  'a.trade_partner_headline_name[data-miniprofile]',
  '.trade_partner_header .playerAvatar[data-miniprofile]',
  '.tradeoffer_items_avatar[data-miniprofile]',
];

/**
 * On /tradeoffer/new/?partner=ACCOUNT_ID&token=… the partner query is an
 * account id (not SteamID64). Convert when present.
 */
export function parsePartnerSteamIdFromTradeOfferUrl(
  href: string,
): string | null {
  try {
    const url = new URL(href);
    if (!/\/tradeoffer\/new/i.test(url.pathname)) {
      return null;
    }
    const partner = url.searchParams.get('partner')?.trim();
    if (!partner) {
      return null;
    }
    if (isRealSteamId64(partner)) {
      return partner;
    }
    return accountIdToSteamId64(partner);
  } catch {
    return null;
  }
}

function steamIdFromMiniprofileAttr(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  if (isRealSteamId64(value)) {
    return value;
  }
  // Steam data-miniprofile is almost always a 32-bit account id.
  return accountIdToSteamId64(value);
}

/**
 * Best-effort read of Steam page globals (MAIN world via wrapper, or same-world).
 * Content scripts often cannot see these — callers may pass an injected snapshot.
 */
export function parsePartnerSteamIdFromPageGlobals(
  globals: Record<string, unknown> | null | undefined,
): string | null {
  if (!globals) {
    return null;
  }
  const candidates = [
    globals.g_rgPartnerSteamId,
    globals.g_ulTradePartnerSteamID,
    globals.g_steamIDPartner,
    (globals.UserThem as { strSteamId?: string } | undefined)?.strSteamId,
    (globals.UserThem as { steamid?: string } | undefined)?.steamid,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const asString = String(candidate).trim();
      if (isRealSteamId64(asString)) {
        return asString;
      }
      const fromAccount = accountIdToSteamId64(asString);
      if (fromAccount) {
        return fromAccount;
      }
    }
  }
  return null;
}

export function parsePartnerSteamIdFromDocument(
  doc: ParentNode = document,
  pageUrl: string = typeof location !== 'undefined' ? location.href : '',
  pageGlobals?: Record<string, unknown> | null,
): string | null {
  const fromGlobals = parsePartnerSteamIdFromPageGlobals(pageGlobals);
  if (fromGlobals) {
    return fromGlobals;
  }

  const fromUrl = parsePartnerSteamIdFromTradeOfferUrl(pageUrl);
  if (fromUrl) {
    return fromUrl;
  }

  for (const selector of PARTNER_MINIPROFILE_SELECTORS) {
    const nodes = doc.querySelectorAll<HTMLElement>(selector);
    for (const node of Array.from(nodes)) {
      const id = steamIdFromMiniprofileAttr(node.getAttribute('data-miniprofile'));
      if (id) {
        return id;
      }
    }
  }

  for (const selector of PARTNER_LINK_SELECTORS) {
    const anchors = doc.querySelectorAll<HTMLAnchorElement>(selector);
    for (const anchor of Array.from(anchors)) {
      const id = extractSteamId64FromHref(anchor.getAttribute('href'));
      if (id) {
        return id;
      }
      const fromMini = steamIdFromMiniprofileAttr(
        anchor.getAttribute('data-miniprofile'),
      );
      if (fromMini) {
        return fromMini;
      }
    }
  }

  // Fallback: any profile link in the trade offer chrome (avoid inventory).
  const scope =
    doc.querySelector('.trade_partner_header, .tradeoffer_header, #mainContents') ??
    doc;
  for (const anchor of Array.from(
    scope.querySelectorAll<HTMLAnchorElement>('a[href*="/profiles/7656119"]'),
  )) {
    const id = extractSteamId64FromHref(anchor.getAttribute('href'));
    if (id) {
      return id;
    }
  }

  for (const node of Array.from(
    scope.querySelectorAll<HTMLElement>('[data-miniprofile]'),
  )) {
    if (node.closest('#inventories, #inventory_box, .inventory_ctn')) {
      continue;
    }
    const id = steamIdFromMiniprofileAttr(node.getAttribute('data-miniprofile'));
    if (id) {
      return id;
    }
  }

  return null;
}
