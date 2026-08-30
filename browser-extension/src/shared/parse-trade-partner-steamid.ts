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
  '.tradeoffer_header a[href*="/profiles/"]',
  '#trade_them a[href*="/profiles/"]',
  '.trade_partner_info_block a[href*="/profiles/"]',
  'a.trade_partner_headline_name[href*="/profiles/"]',
  '.playerAvatar a[href*="/profiles/"]',
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

export function parsePartnerSteamIdFromDocument(
  doc: ParentNode = document,
  pageUrl: string = typeof location !== 'undefined' ? location.href : '',
): string | null {
  const fromUrl = parsePartnerSteamIdFromTradeOfferUrl(pageUrl);
  if (fromUrl) {
    return fromUrl;
  }

  for (const selector of PARTNER_LINK_SELECTORS) {
    const anchors = doc.querySelectorAll<HTMLAnchorElement>(selector);
    for (const anchor of Array.from(anchors)) {
      const id = extractSteamId64FromHref(anchor.getAttribute('href'));
      if (id) {
        return id;
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

  return null;
}
