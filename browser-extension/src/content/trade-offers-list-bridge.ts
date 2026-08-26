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
  type ExtensionLocale,
} from '../shared/extension-i18n.js';
import { getStoredSiteLinkSnapshot } from '../shared/offline-safe-mode.js';
import { isExtensionGuidedBuyerEnabled } from '../shared/extension-flags.js';

const TOOLBAR_ID = 'rip-market-tradeoffers-toolbar';
const DETAIL_ID = 'rip-market-tradeoffers-detail';
const STICKY_ID = 'rip-market-anti-scam-sticky';
const BADGE_ATTR = 'data-rip-offer-mark';
const ACCEPT_ASSIST_ATTR = 'data-rip-accept-assist';
const CONTEXT_ATTR = 'data-rip-offer-context';
const FILTER_STORAGE_KEY = 'rip:tradeoffers-filter-rip-only';
const MAX_MANUAL_CREATE_BUTTONS = 5;

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
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function loadActiveTrades(): Promise<{
  trades: TradeVerificationResult[];
  siteSafeMode: boolean;
}> {
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
    .rip-tradeoffers-toolbar {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      margin: 12px 0 16px; padding: 12px 14px; border-radius: 10px;
      background: #12161e; border: 1px solid #2f3542; color: #e8e8e8;
      font-family: "Segoe UI", system-ui, sans-serif; font-size: 13px;
    }
    .rip-tradeoffers-toolbar strong { color: #8eb7ff; }
    .rip-tradeoffers-toolbar label {
      display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
      user-select: none;
    }
    .rip-tradeoffers-toolbar .count { color: #a8adb8; }
    .rip-tradeoffers-toolbar .manual-create {
      flex: 1 1 100%; display: flex; flex-direction: column; gap: 8px;
      margin-top: 4px; padding-top: 10px; border-top: 1px solid #2a303c;
    }
    .rip-tradeoffers-toolbar .manual-create-head {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline;
    }
    .rip-tradeoffers-toolbar .manual-create-head strong { color: #f0d78a; }
    .rip-tradeoffers-toolbar .manual-create-actions {
      display: flex; flex-wrap: wrap; gap: 8px;
    }
    .rip-tradeoffers-toolbar button.manual-cta {
      border: 1px solid #3d5f8f; border-radius: 8px; padding: 8px 12px;
      background: #1a2740; color: #d7e6ff; cursor: pointer; font: inherit;
      font-weight: 600;
    }
    .rip-tradeoffers-toolbar button.manual-cta:hover:not(:disabled) {
      background: #243556;
    }
    .rip-tradeoffers-toolbar button.manual-cta:disabled {
      opacity: 0.65; cursor: wait;
    }
    .rip-tradeoffers-toolbar button.manual-cta[data-priority="send_manual"] {
      border-color: #8f6f3d; background: #2a2418; color: #f5e2b0;
    }
    .rip-tradeoffers-toolbar .manual-status {
      color: #c7ccd6; font-size: 12px; line-height: 1.4;
    }
    .rip-tradeoffers-toolbar .manual-status--error { color: #f0a8a8; }
    .rip-tradeoffers-toolbar .manual-status--success { color: #8fe6a4; }
    .rip-tradeoffers-toolbar .manual-status a {
      color: #8eb7ff; margin-left: 6px;
    }
    .rip-badge {
      display: inline-flex; align-items: center; gap: 6px;
      margin: 8px 0 4px; padding: 4px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent;
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    .rip-badge svg { width: 12px; height: 12px; flex: 0 0 auto; }
    .rip-badge--verified { background: rgba(47,111,70,.35); color: #8fe6a4; border-color: #2f6f46; }
    .rip-badge--pending { background: rgba(91,141,239,.22); color: #b7d0ff; border-color: #3d5f8f; }
    .rip-badge--mismatch { background: rgba(143,61,61,.35); color: #f0a8a8; border-color: #8f3d3d; }
    .rip-badge--foreign { background: rgba(90,90,98,.35); color: #c7ccd6; border-color: #4a4f5a; }
    .rip-badge-row {
      display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin: 8px 0 4px;
    }
    .rip-badge-row .rip-badge { margin: 0; }
    a.rip-accept-assist {
      display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: rgba(47,111,70,.45); color: #b8f5c6; border: 1px solid #2f6f46;
    }
    a.rip-accept-assist:hover { background: rgba(47,111,70,.65); color: #e8ffe9; }
    .rip-card-context {
      display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
      margin: 0 0 8px; padding: 8px 10px; border-radius: 8px;
      background: rgba(18,22,30,.92); border: 1px solid #2a3140;
      font-family: "Segoe UI", system-ui, sans-serif; font-size: 12px;
      color: #c7ccd6; cursor: pointer; max-width: 100%; width: 100%;
      text-align: left; appearance: none; -webkit-appearance: none;
    }
    .rip-card-context:hover { border-color: #3d5f8f; }
    .rip-card-context .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px; background: #1a2030;
      border: 1px solid #2f3542; color: #e8e8e8; font-weight: 600;
      white-space: nowrap;
    }
    .rip-card-context .chip-order { color: #8eb7ff; border-color: #3d5f8f; }
    .rip-card-context .chip-price { color: #b8f5c6; border-color: #2f6f46; }
    .rip-card-context .chip-role { color: #d7e4ff; }
    .rip-card-context .chip-status { font-weight: 700; }
    .rip-card-context .chip-status.tone-ok { color: #8fe6a4; border-color: #2f6f46; background: rgba(47,111,70,.2); }
    .rip-card-context .chip-status.tone-warn { color: #f0d78a; border-color: #6f5d2f; background: rgba(111,93,47,.2); }
    .rip-card-context .chip-status.tone-error { color: #f0a8a8; border-color: #8f3d3d; background: rgba(143,61,61,.22); }
    .rip-card-context .chip-status.tone-info { color: #b7d0ff; border-color: #3d5f8f; background: rgba(91,141,239,.16); }
    .rip-card-context .chip-status.tone-neutral { color: #c7ccd6; }
    .rip-card-context .item-line {
      flex: 1 1 100%; margin: 0; font-size: 11px; color: #a8adb8;
      line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #${DETAIL_ID} a.rip-accept-assist-detail {
      display: block; text-align: center; text-decoration: none; margin-top: 10px;
      background: #2f6f46; color: #fff; border-radius: 8px; padding: 10px 12px; font-weight: 700;
    }
    #${DETAIL_ID} .context-grid {
      display: grid; grid-template-columns: auto 1fr; gap: 4px 10px;
      margin: 0 0 10px; font-size: 12px;
    }
    #${DETAIL_ID} .context-grid dt { color: #7d8594; margin: 0; }
    #${DETAIL_ID} .context-grid dd { margin: 0; color: #e8e8e8; font-weight: 600; }
    .tradeoffer.rip-card--verified,
    [id^="tradeofferid_"].rip-card--verified {
      outline: 2px solid rgba(47,111,70,.75); outline-offset: 2px;
    }
    .tradeoffer.rip-card--pending,
    [id^="tradeofferid_"].rip-card--pending {
      outline: 2px solid rgba(91,141,239,.65); outline-offset: 2px;
    }
    .tradeoffer.rip-card--mismatch,
    [id^="tradeofferid_"].rip-card--mismatch {
      outline: 2px solid rgba(143,61,61,.85); outline-offset: 2px;
    }
    .tradeoffer.rip-card--foreign,
    [id^="tradeofferid_"].rip-card--foreign {
      outline: 1px solid rgba(90,90,98,.45); outline-offset: 1px;
    }
    .tradeoffer.rip-card--hidden,
    [id^="tradeofferid_"].rip-card--hidden { display: none !important; }
    #${DETAIL_ID} {
      position: fixed; z-index: 2147483646; width: min(340px, calc(100vw - 24px));
      border-radius: 12px; padding: 14px; background: #12161e; color: #e8e8e8;
      border: 1px solid #2f3542; box-shadow: 0 16px 48px rgba(0,0,0,.55);
      font-family: "Segoe UI", system-ui, sans-serif; font-size: 13px;
    }
    #${DETAIL_ID} h2 { margin: 0 0 8px; font-size: 14px; }
    #${DETAIL_ID} p { margin: 0 0 8px; color: #c7ccd6; line-height: 1.4; }
    #${DETAIL_ID} .meta { color: #a8adb8; font-size: 12px; }
    #${DETAIL_ID} a {
      display: block; text-align: center; text-decoration: none; margin-top: 10px;
      background: #5b8def; color: #fff; border-radius: 8px; padding: 10px 12px;
    }
    #${DETAIL_ID} button.close {
      width: 100%; margin-top: 8px; border: none; border-radius: 8px;
      padding: 8px 12px; background: #2a2f3a; color: #e8e8e8; cursor: pointer;
    }
    #${STICKY_ID} {
      position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 2147483645;
      max-width: 520px; margin: 0 auto; padding: 10px 14px; border-radius: 10px;
      background: rgba(18,22,30,.96); color: #f0d78a; border: 1px solid rgba(111,93,47,.65);
      font-family: "Segoe UI", system-ui, sans-serif; font-size: 12px; line-height: 1.4;
      box-shadow: 0 10px 28px rgba(0,0,0,.45); pointer-events: none;
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
      <p><strong>Offer не привязан к активному заказу R.I.P Market.</strong></p>
      <p>Не принимайте обмены из чата, профиля или от незнакомцев — это классический скам-паттерн.</p>
      <p class="meta">Проверьте: нет ли запроса ваших предметов и лишних скинов в оффере.</p>
      <button class="close" type="button">Закрыть</button>
    `;
  } else {
    const partner =
      trade.counterparty.personaName?.trim() ||
      trade.counterparty.username ||
      'контрагент';
    const steamId = trade.counterparty.steamId?.trim() || '—';
    const ctx = buildOfferCardContext(trade, listBridgeLocale);
    const acceptCta =
      guidedBuyerEnabled
        ? buildManualAcceptListCta(trade, listBridgeLocale)
        : null;
    panel.innerHTML = `
      <h2>${escapeHtml(mark.label)}</h2>
      <p><strong>${escapeHtml(ctx.itemName)}</strong></p>
      <dl class="context-grid">
        <dt>Заказ</dt><dd>#${escapeHtml(ctx.orderShortId)}</dd>
        <dt>Цена</dt><dd>${escapeHtml(ctx.priceLabel)}</dd>
        <dt>Роль</dt><dd>${escapeHtml(ctx.roleLabel)}</dd>
        <dt>Статус</dt><dd>${escapeHtml(ctx.platformStatusLabel)}</dd>
        <dt>Дальше</dt><dd>${escapeHtml(ctx.nextActionTitle)}</dd>
      </dl>
      <p class="meta">${escapeHtml(trade.role === 'buyer' ? 'Продавец' : 'Покупатель')}: ${escapeHtml(partner)}</p>
      <p class="meta">SteamID64: <code>${escapeHtml(steamId)}</code></p>
      ${
        acceptCta
          ? `<a class="rip-accept-assist-detail" href="${escapeHtml(acceptCta.href)}">${escapeHtml(acceptCta.label)}</a>`
          : ''
      }
      <a href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">Открыть заказ</a>
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
  const stored = await chrome.storage.local.get(FILTER_STORAGE_KEY);
  return stored[FILTER_STORAGE_KEY] === true;
}

async function setRipOnlyFilter(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [FILTER_STORAGE_KEY]: value });
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

function renderManualCreateSectionHtml(candidates: ManualCreateCandidate[]): string {
  if (candidates.length === 0 && manualCreateStatus.kind === 'idle') {
    return '';
  }
  const shown = candidates.slice(0, MAX_MANUAL_CREATE_BUTTONS);
  const more =
    candidates.length > MAX_MANUAL_CREATE_BUTTONS
      ? `<span class="count">ещё ${candidates.length - MAX_MANUAL_CREATE_BUTTONS}</span>`
      : '';
  const buttons =
    shown.length === 0
      ? ''
      : `<div class="manual-create-actions">${shown
          .map((entry) => {
            const busy =
              manualCreateStatus.kind === 'busy' &&
              manualCreateStatus.orderId === entry.orderId;
            const disabled = manualCreateStatus.kind === 'busy';
            return `<button type="button" class="manual-cta" data-priority="${escapeHtml(entry.reason)}" data-order-id="${escapeHtml(entry.orderId)}" title="${escapeHtml(entry.hint)}" ${disabled ? 'disabled' : ''}>${busy ? 'Собираем…' : escapeHtml(entry.ctaLabel)}</button>`;
          })
          .join('')}${more}</div>`;
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
  ensureBadgeStyles();
  ensureStickyHint();
  const locale = await getStoredExtensionLocale();
  listBridgeLocale = locale;
  guidedBuyerEnabled = await isExtensionGuidedBuyerEnabled();
  const loaded = await loadActiveTrades();
  const trades = loaded.trades;
  const candidates = loaded.siteSafeMode
    ? []
    : listManualCreateCandidates(trades, locale);
  const ripOnly = await getRipOnlyFilter();
  const cards = listTradeOfferElements();
  let rip = 0;
  let mismatch = 0;

  for (const card of cards) {
    const offerId = parseTradeOfferIdFromElementId(card.id);
    if (!offerId) {
      continue;
    }
    const mark = classifyOfferMark(offerId, trades);
    if (isRipOfferMark(mark.kind)) {
      rip += 1;
    }
    if (mark.kind === 'rip_mismatch') {
      mismatch += 1;
    }
    applyCardMark(card, mark, ripOnly, locale);
  }

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
}

function watchListDom(): void {
  const root =
    document.querySelector('.profile_leftcol') ??
    document.querySelector('#mainContents') ??
    document.body;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      void markAllOffers();
    }, 250);
  });
  observer.observe(root, { childList: true, subtree: true });
}

async function mount(): Promise<void> {
  if (!isTradeOffersListPage(window.location.pathname)) {
    return;
  }
  await markAllOffers();
  watchListDom();
  window.setInterval(() => {
    void markAllOffers();
  }, 30_000);
}

void mount();
