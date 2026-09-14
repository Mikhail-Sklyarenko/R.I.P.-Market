import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';
import {
  classifyOfferMark,
  isRipOfferMark,
  parseTradeOfferIdFromElementId,
  type OfferMark,
  type OfferMarkKind,
} from '../shared/trade-offers-list-marking.js';
import { antiScamStickyShort } from '../shared/trade-offer-anti-scam.js';
import {
  listManualCreateCandidates,
  type ManualCreateCandidate,
} from '../shared/manual-create-offer.js';
import { buildManualAcceptListCta } from '../shared/manual-accept-assist.js';
import { buildOfferCardContext } from '../shared/trade-offer-card-context.js';
import {
  DEFAULT_EXTENSION_LOCALE,
  getStoredExtensionLocale,
  createExtensionT,
  type ExtensionLocale,
} from '../shared/extension-i18n.js';
import { getStoredSiteLinkSnapshot } from '../shared/offline-safe-mode.js';
import { isExtensionGuidedBuyerEnabled } from '../shared/extension-flags.js';
import { buildDealShieldModel } from '../shared/deal-shield.js';
import { buildSteamProfileUrl, isRealSteamId64 } from '../shared/steam-id64.js';
import {
  isExtensionContextInvalidatedError,
  isExtensionContextValid,
  withExtensionContext,
} from '../shared/extension-context.js';
import {
  detectSteamOfferPageLifecycle,
  isPostAcceptSteamLifecycle,
} from '../shared/steam-offer-page-lifecycle.js';

const TOOLBAR_ID = 'rip-market-tradeoffers-toolbar';
const DETAIL_ID = 'rip-market-tradeoffers-detail';
const STICKY_ID = 'rip-market-anti-scam-sticky';
const RELOAD_BANNER_ID = 'rip-market-tradeoffers-reload';
const BADGE_ATTR = 'data-rip-offer-mark';
const ACCEPT_ASSIST_ATTR = 'data-rip-accept-assist';
const CONTEXT_ATTR = 'data-rip-offer-context';
const FILTER_STORAGE_KEY = 'rip:tradeoffers-filter-rip-only';
const MAX_MANUAL_CREATE_PRIMARY = 1;

type ManualCreateUiStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; orderId: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'success';
      orderId: string;
      offerId: string;
      confirmPending: boolean;
      siteUrl?: string;
    };

let manualCreateStatus: ManualCreateUiStatus = { kind: 'idle' };
let listBridgeLocale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE;
/** I5: accept-assist CTAs; B1 badges stay when false. */
let guidedBuyerEnabled = true;
/** After extension reload, stop chrome.* loops and ask for tab refresh. */
let extensionContextInvalidated = false;
let listPollTimer: number | null = null;
let listObserver: MutationObserver | null = null;
const reportedListSteamPageKeys = new Set<string>();

function maybeReportListSteamOfferPage(
  trade: TradeVerificationResult,
  card: HTMLElement,
): void {
  const offerId = trade.offerId?.trim();
  if (!offerId) {
    return;
  }
  const page = detectSteamOfferPageLifecycle(card);
  if (!isPostAcceptSteamLifecycle(page.lifecycle)) {
    return;
  }
  const key = `${trade.orderId}:${offerId}:${page.lifecycle}`;
  if (reportedListSteamPageKeys.has(key)) {
    return;
  }
  reportedListSteamPageKeys.add(key);
  void runtimeRequest<{ ok: boolean }>({
    type: TRADE_VERIFICATION_RUNTIME.REPORT_STEAM_OFFER_PAGE,
    orderId: trade.orderId,
    offerId,
    lifecycle: page.lifecycle === 'invalid' ? 'invalid' : 'accepted',
    idempotencyKey: `steam-page-list:${trade.orderId}:${offerId}:${page.lifecycle}`,
  }).catch(() => undefined);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isTradeOffersListPage(pathname: string): boolean {
  return /\/tradeoffers\/?/i.test(pathname) && !/\/tradeoffer\/\d+/i.test(pathname);
}

async function runtimeRequest<T>(message: Record<string, unknown>): Promise<T> {
  if (!isExtensionContextValid()) {
    extensionContextInvalidated = true;
    throw new Error('Extension context invalidated');
  }
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error) || !isExtensionContextValid()) {
      extensionContextInvalidated = true;
    }
    throw error;
  }
}

async function loadActiveTrades(): Promise<{
  trades: TradeVerificationResult[];
  siteSafeMode: boolean;
}> {
  const empty = { trades: [] as TradeVerificationResult[], siteSafeMode: true };
  const result = await withExtensionContext(async () => {
    const refreshed = await runtimeRequest<{
      ok: boolean;
      trades?: TradeVerificationResult[];
      siteLink?: { safeMode?: boolean };
    }>({
      type: TRADE_VERIFICATION_RUNTIME.REFRESH_ACTIVE_TRADES,
    });
    if (refreshed.ok && refreshed.trades) {
      return {
        trades: refreshed.trades,
        siteSafeMode: Boolean(refreshed.siteLink?.safeMode),
      };
    }
    const cached = await runtimeRequest<{
      ok: boolean;
      trades?: TradeVerificationResult[];
      siteLink?: { safeMode?: boolean };
    }>({
      type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
    });
    const stored = await getStoredSiteLinkSnapshot();
    return {
      trades: cached.ok && cached.trades ? cached.trades : [],
      siteSafeMode: Boolean(cached.siteLink?.safeMode ?? stored.safeMode),
    };
  }, empty);
  if (!result.ok && result.invalidated) {
    extensionContextInvalidated = true;
  }
  return result.value;
}

function listTradeOfferElements(): HTMLElement[] {
  const byClass = Array.from(document.querySelectorAll<HTMLElement>('.tradeoffer'));
  if (byClass.length > 0) {
    return byClass;
  }
  return Array.from(
    document.querySelectorAll<HTMLElement>('[id^="tradeofferid_"]'),
  );
}

function badgeClass(kind: OfferMarkKind): string {
  switch (kind) {
    case 'rip_verified':
      return 'rip-badge rip-badge--verified';
    case 'rip_pending':
      return 'rip-badge rip-badge--pending';
    case 'rip_mismatch':
      return 'rip-badge rip-badge--mismatch';
    default:
      return 'rip-badge rip-badge--foreign';
  }
}

function cardClass(kind: OfferMarkKind): string {
  switch (kind) {
    case 'rip_verified':
      return 'rip-card--verified';
    case 'rip_pending':
      return 'rip-card--pending';
    case 'rip_mismatch':
      return 'rip-card--mismatch';
    default:
      return 'rip-card--foreign';
  }
}

function ensureBadgeStyles(): void {
  let style = document.getElementById(
    'rip-market-tradeoffers-style',
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'rip-market-tradeoffers-style';
    document.documentElement.appendChild(style);
  }
  style.textContent = `
    :root {
      --rip-bg: #0b0d12;
      --rip-elevated-solid: #181c26;
      --rip-text: #f4f4f5;
      --rip-muted: #94a3b8;
      --rip-soft: #a8b0c0;
      --rip-link: #7dd3fc;
      --rip-border: rgba(255, 255, 255, 0.08);
      --rip-primary-from: #0284c7;
      --rip-primary-to: #2563eb;
      --rip-success: #86efac;
      --rip-success-bg: rgba(34, 197, 94, 0.16);
      --rip-warn: #fde047;
      --rip-warn-bg: rgba(234, 179, 8, 0.14);
      --rip-danger: #fecaca;
      --rip-danger-bg: rgba(239, 68, 68, 0.14);
      --rip-radius: 12px;
      --rip-radius-sm: 8px;
    }
    .rip-tradeoffers-toolbar {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      margin: 12px 0 16px; padding: 12px 14px; border-radius: var(--rip-radius);
      background: var(--rip-elevated-solid); border: 1px solid var(--rip-border);
      color: var(--rip-text);
      font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 13px;
    }
    .rip-tradeoffers-toolbar strong { color: var(--rip-link); }
    .rip-tradeoffers-toolbar label {
      display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
      user-select: none;
    }
    .rip-tradeoffers-toolbar .count { color: var(--rip-muted); }
    .rip-tradeoffers-toolbar .manual-create {
      flex: 1 1 100%; display: flex; flex-direction: column; gap: 8px;
      margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--rip-border);
    }
    .rip-tradeoffers-toolbar .manual-create-head {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline;
    }
    .rip-tradeoffers-toolbar .manual-create-head strong { color: var(--rip-text); }
    .rip-tradeoffers-toolbar .manual-create-actions {
      display: flex; flex-wrap: wrap; gap: 8px;
    }
    .rip-tradeoffers-toolbar button.manual-cta {
      border: 1px solid var(--rip-border); border-radius: var(--rip-radius-sm);
      padding: 8px 12px; background: rgba(15, 23, 42, 0.65);
      color: var(--rip-text); cursor: pointer; font: inherit; font-weight: 600;
    }
    .rip-tradeoffers-toolbar button.manual-cta--primary {
      border: none;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff;
    }
    .rip-tradeoffers-toolbar button.manual-cta--ghost {
      background: transparent; color: var(--rip-muted); font-weight: 500;
    }
    .rip-tradeoffers-toolbar button.manual-cta:hover:not(:disabled) {
      filter: brightness(1.06);
    }
    .rip-tradeoffers-toolbar button.manual-cta:disabled {
      opacity: 0.65; cursor: wait;
    }
    .rip-tradeoffers-toolbar details.manual-create-more summary {
      cursor: pointer; font-size: 12px; color: var(--rip-muted); user-select: none;
      list-style: none;
    }
    .rip-tradeoffers-toolbar details.manual-create-more summary::-webkit-details-marker {
      display: none;
    }
    .rip-tradeoffers-toolbar .manual-status {
      color: var(--rip-soft); font-size: 12px; line-height: 1.4;
    }
    .rip-tradeoffers-toolbar .manual-status--error { color: var(--rip-danger); }
    .rip-tradeoffers-toolbar .manual-status--success { color: var(--rip-success); }
    .rip-tradeoffers-toolbar .manual-status a {
      color: var(--rip-link); margin-left: 6px;
    }
    .rip-badge {
      display: inline-flex; align-items: center; gap: 6px;
      margin: 8px 0 4px; padding: 4px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }
    .rip-badge svg { width: 12px; height: 12px; flex: 0 0 auto; }
    .rip-badge--verified {
      background: var(--rip-success-bg); color: var(--rip-success);
      border-color: rgba(134, 239, 172, 0.35);
    }
    .rip-badge--pending {
      background: rgba(56, 189, 248, 0.12); color: var(--rip-link);
      border-color: rgba(125, 211, 252, 0.35);
    }
    .rip-badge--mismatch {
      background: var(--rip-danger-bg); color: var(--rip-danger);
      border-color: rgba(248, 113, 113, 0.4);
    }
    .rip-badge--foreign {
      background: rgba(30, 41, 59, 0.55); color: var(--rip-muted);
      border-color: var(--rip-border);
    }
    .rip-badge-row {
      display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin: 8px 0 4px;
    }
    .rip-badge-row .rip-badge { margin: 0; }
    a.rip-accept-assist {
      display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff; border: none;
    }
    a.rip-accept-assist:hover { filter: brightness(1.07); }
    .rip-card-context {
      display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
      margin: 0 0 8px; padding: 8px 10px; border-radius: var(--rip-radius-sm);
      background: var(--rip-elevated-solid); border: 1px solid var(--rip-border);
      font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 12px;
      color: var(--rip-soft); cursor: pointer; max-width: 100%; width: 100%;
      text-align: left; appearance: none; -webkit-appearance: none;
    }
    .rip-card-context:hover { border-color: rgba(125, 211, 252, 0.35); }
    .rip-card-context .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px; background: rgba(15, 23, 42, 0.72);
      border: 1px solid var(--rip-border); color: var(--rip-text); font-weight: 600;
      white-space: nowrap;
    }
    .rip-card-context .chip-order { color: var(--rip-link); border-color: rgba(125, 211, 252, 0.28); }
    .rip-card-context .chip-price { color: var(--rip-success); border-color: rgba(134, 239, 172, 0.28); }
    .rip-card-context .chip-role { color: var(--rip-soft); }
    .rip-card-context .chip-status { font-weight: 700; }
    .rip-card-context .chip-status.tone-ok {
      color: var(--rip-success); border-color: rgba(134, 239, 172, 0.35);
      background: var(--rip-success-bg);
    }
    .rip-card-context .chip-status.tone-warn {
      color: var(--rip-warn); border-color: rgba(253, 224, 71, 0.35);
      background: var(--rip-warn-bg);
    }
    .rip-card-context .chip-status.tone-error {
      color: var(--rip-danger); border-color: rgba(248, 113, 113, 0.4);
      background: var(--rip-danger-bg);
    }
    .rip-card-context .chip-status.tone-info {
      color: var(--rip-link); border-color: rgba(125, 211, 252, 0.28);
      background: rgba(56, 189, 248, 0.1);
    }
    .rip-card-context .chip-status.tone-neutral { color: var(--rip-muted); }
    .rip-card-context .item-line {
      flex: 1 1 100%; margin: 0; font-size: 11px; color: var(--rip-muted);
      line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #${DETAIL_ID} a.rip-detail-primary {
      display: block; text-align: center; text-decoration: none; margin-top: 10px;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff; border-radius: var(--rip-radius-sm); padding: 10px 12px; font-weight: 700;
    }
    #${DETAIL_ID} a.rip-detail-secondary {
      display: block; text-align: center; text-decoration: none; margin-top: 8px;
      background: transparent; color: var(--rip-link);
      border: 1px solid var(--rip-border); border-radius: var(--rip-radius-sm);
      padding: 8px 12px; font-weight: 600;
    }
    #${DETAIL_ID} a.rip-detail-inline-link {
      display: inline; margin: 0; padding: 0; border: none; background: none;
      color: var(--rip-link); font-size: 12px; font-weight: 600;
    }
    #${DETAIL_ID} .context-grid {
      display: grid; grid-template-columns: auto 1fr; gap: 4px 10px;
      margin: 0 0 10px; font-size: 12px;
    }
    #${DETAIL_ID} .context-grid dt { color: var(--rip-muted); margin: 0; }
    #${DETAIL_ID} .context-grid dd { margin: 0; color: var(--rip-text); font-weight: 600; }
    .tradeoffer.rip-card--verified,
    [id^="tradeofferid_"].rip-card--verified {
      outline: 2px solid rgba(134, 239, 172, 0.55); outline-offset: 2px;
    }
    .tradeoffer.rip-card--pending,
    [id^="tradeofferid_"].rip-card--pending {
      outline: 2px solid rgba(125, 211, 252, 0.45); outline-offset: 2px;
    }
    .tradeoffer.rip-card--mismatch,
    [id^="tradeofferid_"].rip-card--mismatch {
      outline: 2px solid rgba(248, 113, 113, 0.55); outline-offset: 2px;
    }
    .tradeoffer.rip-card--foreign,
    [id^="tradeofferid_"].rip-card--foreign {
      outline: 1px solid var(--rip-border); outline-offset: 1px;
    }
    .tradeoffer.rip-card--hidden,
    [id^="tradeofferid_"].rip-card--hidden { display: none !important; }
    #${DETAIL_ID} {
      position: fixed; z-index: 2147483646; width: min(340px, calc(100vw - 24px));
      border-radius: var(--rip-radius); padding: 14px; background: var(--rip-elevated-solid);
      color: var(--rip-text); border: 1px solid var(--rip-border);
      box-shadow: 0 16px 48px rgba(0,0,0,.55);
      font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 13px;
    }
    #${DETAIL_ID} h2 { margin: 0 0 8px; font-size: 14px; color: var(--rip-text); }
    #${DETAIL_ID} p { margin: 0 0 8px; color: var(--rip-soft); line-height: 1.4; }
    #${DETAIL_ID} .meta { color: var(--rip-muted); font-size: 12px; }
    #${DETAIL_ID} .rip-detail-hero {
      display: flex; gap: 10px; align-items: center; margin: 0 0 10px;
      padding: 8px; border-radius: var(--rip-radius-sm);
      background: rgba(15, 23, 42, 0.55); border: 1px solid var(--rip-border);
    }
    #${DETAIL_ID} .rip-detail-avatar {
      width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
    }
    #${DETAIL_ID} .rip-detail-avatar-fallback {
      width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
      background: var(--rip-bg); border: 1px solid var(--rip-border);
      color: var(--rip-muted); font-weight: 700; flex-shrink: 0;
    }
    #${DETAIL_ID} button.close {
      width: 100%; margin-top: 8px; border: 1px solid var(--rip-border); border-radius: var(--rip-radius-sm);
      padding: 8px 12px; background: transparent; color: var(--rip-muted); cursor: pointer;
      font-family: inherit; font-size: 12px;
    }
    #${DETAIL_ID} button.close:hover { color: var(--rip-text); }
    #${STICKY_ID} {
      position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 2147483645;
      max-width: 520px; margin: 0 auto; padding: 10px 14px; border-radius: var(--rip-radius-sm);
      background: var(--rip-warn-bg); color: var(--rip-warn);
      border: 1px solid rgba(253, 224, 71, 0.35);
      font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4;
      box-shadow: 0 10px 28px rgba(0,0,0,.45); pointer-events: none;
    }
    .rip-tradeoffers-reload {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      margin: 12px 0 16px; padding: 12px 14px; border-radius: var(--rip-radius);
      background: var(--rip-warn-bg); border: 1px solid rgba(253, 224, 71, 0.35);
      color: #f5e6b8;
      font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 13px;
    }
    .rip-tradeoffers-reload strong { color: var(--rip-warn); }
    .rip-tradeoffers-reload button {
      border: 1px solid rgba(253, 224, 71, 0.4); border-radius: var(--rip-radius-sm);
      padding: 8px 12px; background: rgba(15, 23, 42, 0.72); color: var(--rip-text);
      cursor: pointer; font: inherit; font-weight: 600;
    }
  `;
}

function ensureStickyHint(): void {
  ensureBadgeStyles();
  let sticky = document.getElementById(STICKY_ID);
  if (!sticky) {
    sticky = document.createElement('div');
    sticky.id = STICKY_ID;
    document.documentElement.appendChild(sticky);
  }
  sticky.textContent = antiScamStickyShort();
}

function shieldSvg(): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.2 2.5 3.4v4.2c0 3.4 2.3 5.9 5.5 7 3.2-1.1 5.5-3.6 5.5-7V3.4L8 1.2Zm0 1.7 4 1.4v3.3c0 2.4-1.5 4.3-4 5.2-2.5-.9-4-2.8-4-5.2V4.3l4-1.4Z"/></svg>`;
}

function findBadgeHost(card: HTMLElement): HTMLElement {
  return (
    card.querySelector<HTMLElement>('.tradeoffer_header') ??
    card.querySelector<HTMLElement>('.tradeoffer_items_banner') ??
    card
  );
}

function upsertBadge(card: HTMLElement, mark: OfferMark): HTMLButtonElement {
  const host = findBadgeHost(card);
  let row = host.querySelector<HTMLElement>('.rip-badge-row');
  if (!row) {
    row = document.createElement('div');
    row.className = 'rip-badge-row';
    host.prepend(row);
  }
  let badge = row.querySelector<HTMLButtonElement>(`button[${BADGE_ATTR}]`);
  if (!badge) {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.setAttribute(BADGE_ATTR, '1');
    row.prepend(badge);
  }
  badge.className = badgeClass(mark.kind);
  badge.dataset.kind = mark.kind;
  badge.innerHTML = `${shieldSvg()}<span>${escapeHtml(mark.label)}</span>`;
  badge.title =
    mark.kind === 'not_ours'
      ? 'Нет активной сделки R.I.P Market с этим offerId'
      : 'Открыть детали сделки R.I.P Market';
  return badge;
}

function upsertAcceptAssist(
  card: HTMLElement,
  mark: OfferMark,
  locale: ExtensionLocale,
): void {
  const host = findBadgeHost(card);
  const row = host.querySelector<HTMLElement>('.rip-badge-row');
  const existing = row?.querySelector<HTMLAnchorElement>(
    `a[${ACCEPT_ASSIST_ATTR}]`,
  );
  if (!guidedBuyerEnabled) {
    existing?.remove();
    return;
  }
  const cta = mark.trade
    ? buildManualAcceptListCta(mark.trade, locale)
    : null;
  if (!cta || !row) {
    existing?.remove();
    return;
  }
  let link = existing;
  if (!link) {
    link = document.createElement('a');
    link.setAttribute(ACCEPT_ASSIST_ATTR, '1');
    link.className = 'rip-accept-assist';
    row.appendChild(link);
  }
  link.href = cta.href;
  link.removeAttribute('target');
  link.removeAttribute('rel');
  link.textContent = cta.label;
  link.title = cta.hint;
  link.onclick = (event) => {
    // Keep navigation; stop Steam card handlers from swallowing the click.
    event.stopPropagation();
  };
}

function upsertCardContext(
  card: HTMLElement,
  mark: OfferMark,
  locale: ExtensionLocale,
): void {
  const host = findBadgeHost(card);
  const existing = host.querySelector<HTMLElement>(`[${CONTEXT_ATTR}]`);
  if (!mark.trade || !isRipOfferMark(mark.kind)) {
    existing?.remove();
    return;
  }
  const ctx = buildOfferCardContext(mark.trade, locale);
  let strip = existing as HTMLButtonElement | null;
  if (!strip) {
    strip = document.createElement('button');
    strip.type = 'button';
    strip.setAttribute(CONTEXT_ATTR, '1');
    strip.className = 'rip-card-context';
    const row = host.querySelector('.rip-badge-row');
    if (row?.nextSibling) {
      host.insertBefore(strip, row.nextSibling);
    } else if (row) {
      row.after(strip);
    } else {
      host.prepend(strip);
    }
  }
  strip.title = `${ctx.summaryLine} · ${ctx.nextActionTitle}`;
  strip.innerHTML = `
    <span class="chip chip-order">#${escapeHtml(ctx.orderShortId)}</span>
    <span class="chip chip-price">${escapeHtml(ctx.priceLabel)}</span>
    <span class="chip chip-role">${escapeHtml(ctx.roleLabel)}</span>
    <span class="chip chip-status tone-${escapeHtml(ctx.platformStatusTone)}">${escapeHtml(ctx.platformStatusLabel)}</span>
    <p class="item-line">${escapeHtml(ctx.itemName)}</p>
  `;
  strip.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDetail(mark, strip);
  };
}

function clearCardMarkClasses(card: HTMLElement): void {
  card.classList.remove(
    'rip-card--verified',
    'rip-card--pending',
    'rip-card--mismatch',
    'rip-card--foreign',
    'rip-card--hidden',
  );
}

function applyCardMark(
  card: HTMLElement,
  mark: OfferMark,
  ripOnly: boolean,
  locale: ExtensionLocale,
): void {
  clearCardMarkClasses(card);
  card.classList.add(cardClass(mark.kind));
  if (ripOnly && !isRipOfferMark(mark.kind)) {
    card.classList.add('rip-card--hidden');
  }
  const badge = upsertBadge(card, mark);
  upsertAcceptAssist(card, mark, locale);
  upsertCardContext(card, mark, locale);
  badge.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDetail(mark, badge);
  };
}

function closeDetail(): void {
  document.getElementById(DETAIL_ID)?.remove();
}

function showDetail(mark: OfferMark, anchor: HTMLElement): void {
  closeDetail();
  const panel = document.createElement('div');
  panel.id = DETAIL_ID;
  const trade = mark.trade;
  if (!trade) {
    panel.innerHTML = `
      <h2>Не наша сделка</h2>
      <p>Оффер не привязан к заказу R.I.P Market. Не принимайте обмены из чата или от незнакомцев.</p>
      <button class="close" type="button">Закрыть</button>
    `;
  } else {
    const shield = buildDealShieldModel({
      trade,
      locale: listBridgeLocale,
    });
    const t = createExtensionT(listBridgeLocale);
    const ctx = buildOfferCardContext(trade, listBridgeLocale);
    const acceptCta =
      guidedBuyerEnabled
        ? buildManualAcceptListCta(trade, listBridgeLocale)
        : null;
    const avatar = shield.partner.avatarUrl
      ? `<img class="rip-detail-avatar" src="${escapeHtml(shield.partner.avatarUrl)}" alt="" />`
      : `<span class="rip-detail-avatar-fallback">${escapeHtml(shield.partner.displayName.slice(0, 1).toUpperCase())}</span>`;
    const profile =
      shield.partner.steamId && isRealSteamId64(shield.partner.steamId)
        ? `<a class="rip-detail-inline-link" href="${escapeHtml(buildSteamProfileUrl(shield.partner.steamId))}" target="_blank" rel="noreferrer">${escapeHtml(t('shield.openProfile'))}</a>`
        : '';
    const itemLines =
      shield.item.lines.length > 0
        ? `<p class="meta">${escapeHtml(
            shield.item.lines.map((l) => `${l.label}: ${l.value}`).join(' · '),
          )}</p>`
        : '';
    panel.innerHTML = `
      <h2>${escapeHtml(mark.label)}</h2>
      <div class="rip-detail-hero">
        ${avatar}
        <div>
          <p class="meta">${escapeHtml(shield.counterpartyRoleLabel)}</p>
          <p><strong>${escapeHtml(shield.partner.displayName)}</strong></p>
          <p class="meta">SteamID64: <code>${escapeHtml(shield.partner.steamId || '—')}</code></p>
          ${profile}
        </div>
      </div>
      <p><strong>${escapeHtml(ctx.itemName)}</strong></p>
      ${itemLines}
      <dl class="context-grid">
        <dt>Заказ</dt><dd>#${escapeHtml(ctx.orderShortId)}</dd>
        <dt>Цена</dt><dd>${escapeHtml(ctx.priceLabel)}</dd>
        <dt>Роль</dt><dd>${escapeHtml(ctx.roleLabel)}</dd>
        <dt>Статус</dt><dd>${escapeHtml(ctx.platformStatusLabel)}</dd>
        <dt>Дальше</dt><dd>${escapeHtml(ctx.nextActionTitle)}</dd>
      </dl>
      ${
        acceptCta
          ? `<a class="rip-detail-primary" href="${escapeHtml(acceptCta.href)}">${escapeHtml(acceptCta.label)}</a>
      <a class="rip-detail-secondary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('common.openOrder'))}</a>`
          : `<a class="rip-detail-primary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('common.openOrder'))}</a>`
      }
      <button class="close" type="button">Закрыть</button>
    `;
  }
  document.documentElement.appendChild(panel);
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 24, Math.max(12, rect.bottom + 8));
  const left = Math.min(window.innerWidth - 24, Math.max(12, rect.left));
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.querySelector('button.close')?.addEventListener('click', () => closeDetail());
}

async function getRipOnlyFilter(): Promise<boolean> {
  const result = await withExtensionContext(async () => {
    const stored = await chrome.storage.local.get(FILTER_STORAGE_KEY);
    return stored[FILTER_STORAGE_KEY] === true;
  }, false);
  if (!result.ok && result.invalidated) {
    extensionContextInvalidated = true;
  }
  return result.value;
}

async function setRipOnlyFilter(value: boolean): Promise<void> {
  const result = await withExtensionContext(async () => {
    await chrome.storage.local.set({ [FILTER_STORAGE_KEY]: value });
  }, undefined);
  if (!result.ok && result.invalidated) {
    extensionContextInvalidated = true;
  }
}

function stopListBridgeLoops(): void {
  if (listPollTimer !== null) {
    window.clearInterval(listPollTimer);
    listPollTimer = null;
  }
  listObserver?.disconnect();
  listObserver = null;
}

function showExtensionReloadBanner(): void {
  ensureBadgeStyles();
  stopListBridgeLoops();
  document.getElementById(TOOLBAR_ID)?.remove();
  document.getElementById(DETAIL_ID)?.remove();
  document.getElementById(STICKY_ID)?.remove();
  let banner = document.getElementById(RELOAD_BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = RELOAD_BANNER_ID;
    banner.className = 'rip-tradeoffers-reload';
    const mount =
      document.querySelector('.profile_leftcol') ??
      document.querySelector('#mainContents') ??
      document.querySelector('.responsive_page_template_content') ??
      document.body;
    mount.prepend(banner);
  }
  banner.innerHTML = `
    <strong>R.I.P Market обновился</strong>
    <span>Обновите эту вкладку Steam — иначе бейджи сделок не работают.</span>
    <button type="button" data-rip-reload-tab>Обновить страницу</button>
  `;
  banner
    .querySelector('[data-rip-reload-tab]')
    ?.addEventListener('click', () => {
      window.location.reload();
    });
}

function renderManualCreateStatusHtml(): string {
  if (manualCreateStatus.kind === 'busy') {
    return `<p class="manual-status">Собираем оффер… Steam откроет Trade URL покупателя и подставит предмет. Guard подтвердите вручную.</p>`;
  }
  if (manualCreateStatus.kind === 'error') {
    return `<p class="manual-status manual-status--error">${escapeHtml(manualCreateStatus.message)}</p>`;
  }
  if (manualCreateStatus.kind === 'success') {
    const guard = manualCreateStatus.confirmPending
      ? ' Подтвердите в Steam Mobile (Guard).'
      : '';
    const link = manualCreateStatus.siteUrl
      ? ` <a href="${escapeHtml(manualCreateStatus.siteUrl)}" target="_blank" rel="noreferrer">Открыть заказ</a>`
      : '';
    return `<p class="manual-status manual-status--success">Оффер ${escapeHtml(manualCreateStatus.offerId)} отправлен.${guard}${link}</p>`;
  }
  return '';
}

function renderManualCreateButtonHtml(
  entry: ManualCreateCandidate,
  variant: 'primary' | 'ghost',
): string {
  const busy =
    manualCreateStatus.kind === 'busy' &&
    manualCreateStatus.orderId === entry.orderId;
  const disabled = manualCreateStatus.kind === 'busy';
  const cls =
    variant === 'primary'
      ? 'manual-cta manual-cta--primary'
      : 'manual-cta manual-cta--ghost';
  return `<button type="button" class="${cls}" data-priority="${escapeHtml(entry.reason)}" data-order-id="${escapeHtml(entry.orderId)}" title="${escapeHtml(entry.hint)}" ${disabled ? 'disabled' : ''}>${busy ? 'Собираем…' : escapeHtml(entry.ctaLabel)}</button>`;
}

function renderManualCreateSectionHtml(candidates: ManualCreateCandidate[]): string {
  if (candidates.length === 0 && manualCreateStatus.kind === 'idle') {
    return '';
  }
  const primary = candidates.slice(0, MAX_MANUAL_CREATE_PRIMARY);
  const extras = candidates.slice(MAX_MANUAL_CREATE_PRIMARY);
  const primaryBlock =
    primary.length === 0
      ? ''
      : `<div class="manual-create-actions">${primary
          .map((entry) => renderManualCreateButtonHtml(entry, 'primary'))
          .join('')}</div>`;
  const extrasBlock =
    extras.length === 0
      ? ''
      : `<details class="manual-create-more"><summary>Ещё заказы (${extras.length})</summary><div class="manual-create-actions">${extras
          .map((entry) => renderManualCreateButtonHtml(entry, 'ghost'))
          .join('')}</div></details>`;
  const buttons =
    primaryBlock || extrasBlock ? `${primaryBlock}${extrasBlock}` : '';
  return `
    <div class="manual-create" data-manual-create>
      <div class="manual-create-head">
        <strong>Собрать оффер</strong>
        <span class="count">если авто не смог — тот же autofill, что и при покупке</span>
      </div>
      ${buttons}
      ${renderManualCreateStatusHtml()}
    </div>
  `;
}

async function launchManualCreate(orderId: string): Promise<void> {
  if (manualCreateStatus.kind === 'busy') {
    return;
  }
  manualCreateStatus = { kind: 'busy', orderId };
  void markAllOffers();
  try {
    const result = await runtimeRequest<{
      ok: boolean;
      offerId?: string;
      confirmPending?: boolean;
      siteUrl?: string;
      error?: string;
    }>({
      type: TRADE_VERIFICATION_RUNTIME.MANUAL_CREATE_OFFER,
      orderId,
    });
    if (!result.ok || !result.offerId) {
      manualCreateStatus = {
        kind: 'error',
        message: result.error?.trim() || 'Не удалось собрать оффер',
      };
    } else {
      manualCreateStatus = {
        kind: 'success',
        orderId,
        offerId: result.offerId,
        confirmPending: Boolean(result.confirmPending),
        siteUrl: result.siteUrl,
      };
    }
  } catch (error) {
    if (
      isExtensionContextInvalidatedError(error) ||
      !isExtensionContextValid()
    ) {
      extensionContextInvalidated = true;
      showExtensionReloadBanner();
      return;
    }
    manualCreateStatus = {
      kind: 'error',
      message:
        error instanceof Error ? error.message : 'Не удалось собрать оффер',
    };
  }
  await markAllOffers();
}

function ensureToolbar(stats: {
  total: number;
  rip: number;
  mismatch: number;
  candidates: ManualCreateCandidate[];
}): HTMLElement {
  let toolbar = document.getElementById(TOOLBAR_ID) as HTMLElement | null;
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'rip-tradeoffers-toolbar';
    const mount =
      document.querySelector('.profile_leftcol') ??
      document.querySelector('#mainContents') ??
      document.querySelector('.responsive_page_template_content') ??
      document.body;
    mount.prepend(toolbar);
  }
  toolbar.innerHTML = `
    <strong>R.I.P Market</strong>
    <span class="count">на странице: ${stats.rip}/${stats.total} наших${
      stats.mismatch > 0 ? ` · подозрительных: ${stats.mismatch}` : ''
    }</span>
    <label>
      <input type="checkbox" data-rip-filter />
      Только сделки R.I.P
    </label>
    <span class="count" data-anti-scam-hint>${escapeHtml(antiScamStickyShort())}</span>
    ${renderManualCreateSectionHtml(stats.candidates)}
  `;
  return toolbar;
}

async function markAllOffers(): Promise<void> {
  if (extensionContextInvalidated || !isExtensionContextValid()) {
    extensionContextInvalidated = true;
    showExtensionReloadBanner();
    return;
  }
  try {
    ensureBadgeStyles();
    ensureStickyHint();
    const locale = await getStoredExtensionLocale();
    listBridgeLocale = locale;
    guidedBuyerEnabled = await isExtensionGuidedBuyerEnabled();
    if (extensionContextInvalidated || !isExtensionContextValid()) {
      showExtensionReloadBanner();
      return;
    }
    const loaded = await loadActiveTrades();
    if (extensionContextInvalidated) {
      showExtensionReloadBanner();
      return;
    }
    const trades = loaded.trades;
    const candidates = loaded.siteSafeMode
      ? []
      : listManualCreateCandidates(trades, locale);
    const ripOnly = await getRipOnlyFilter();
    if (extensionContextInvalidated) {
      showExtensionReloadBanner();
      return;
    }
    const cards = listTradeOfferElements();
    let rip = 0;
    let mismatch = 0;

    for (const card of cards) {
      const offerId = parseTradeOfferIdFromElementId(card.id);
      if (!offerId) {
        continue;
      }
    const mark = classifyOfferMark(offerId, trades);
    if (mark.trade) {
      maybeReportListSteamOfferPage(mark.trade, card);
    }
    if (isRipOfferMark(mark.kind)) {
      rip += 1;
    }
      if (mark.kind === 'rip_mismatch') {
        mismatch += 1;
      }
      applyCardMark(card, mark, ripOnly, locale);
    }

    document.getElementById(RELOAD_BANNER_ID)?.remove();
    const toolbar = ensureToolbar({
      total: cards.length,
      rip,
      mismatch,
      candidates,
    });
    const checkbox = toolbar.querySelector<HTMLInputElement>('input[data-rip-filter]');
    if (checkbox) {
      checkbox.checked = ripOnly;
      checkbox.onchange = () => {
        void setRipOnlyFilter(checkbox.checked).then(() => markAllOffers());
      };
    }
    toolbar.querySelectorAll<HTMLButtonElement>('button.manual-cta').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const orderId = button.dataset.orderId?.trim();
        if (orderId) {
          void launchManualCreate(orderId);
        }
      };
    });
  } catch (error) {
    if (
      isExtensionContextInvalidatedError(error) ||
      !isExtensionContextValid()
    ) {
      extensionContextInvalidated = true;
      showExtensionReloadBanner();
      return;
    }
    throw error;
  }
}

function watchListDom(): void {
  const root =
    document.querySelector('.profile_leftcol') ??
    document.querySelector('#mainContents') ??
    document.body;
  let timer: number | null = null;
  listObserver?.disconnect();
  listObserver = new MutationObserver(() => {
    if (extensionContextInvalidated) {
      listObserver?.disconnect();
      return;
    }
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      void markAllOffers();
    }, 250);
  });
  listObserver.observe(root, { childList: true, subtree: true });
}

async function mount(): Promise<void> {
  if (!isTradeOffersListPage(window.location.pathname)) {
    return;
  }
  await markAllOffers();
  if (extensionContextInvalidated) {
    return;
  }
  watchListDom();
  listPollTimer = window.setInterval(() => {
    void markAllOffers();
  }, 30_000);
}

void mount().catch((error) => {
  if (
    isExtensionContextInvalidatedError(error) ||
    !isExtensionContextValid()
  ) {
    extensionContextInvalidated = true;
    showExtensionReloadBanner();
    return;
  }
  console.warn('[rip-market] tradeoffers list bridge failed', error);
});
