import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  TRADE_VERIFICATION_RUNTIME,
  type AckTradeRuntimeRequest,
} from '../shared/trade-verification-runtime.js';
import {
  detectTradePageRole,
  parseObservedItemFromTradePage,
} from '../shared/trade-offer-observed-item.js';
import {
  buyerOfferPagePrimaryHint,
  type ObservedOfferSnapshot,
} from '../shared/trade-offer-guided-gate.js';
import { buildInFlowDisputeSupportUrl } from '../shared/in-flow-dispute.js';
import {
  createExtensionT,
  getStoredExtensionLocale,
  type ExtensionLocale,
} from '../shared/extension-i18n.js';
import {
  antiScamHasBlocking,
  antiScamStickyShort,
  evaluateAntiScamRules,
  parseOfferSlotSnapshot,
  type AntiScamWarning,
  type OfferSlotSnapshot,
} from '../shared/trade-offer-anti-scam.js';
import {
  buildOfferAcceptAssistView,
  canShowManualAcceptAssist,
  clickSteamAcceptControl,
  clearSteamAcceptHighlights,
  findSteamAcceptControls,
  highlightSteamAcceptControl,
  pickSteamAcceptControl,
  type OfferAcceptAssistPhase,
  type SteamAcceptControlKind,
} from '../shared/manual-accept-assist.js';
import { isExtensionGuidedBuyerEnabled } from '../shared/extension-flags.js';
import {
  applyPartnerObservation,
  buildDealShieldModel,
  type DealShieldModel,
} from '../shared/deal-shield.js';
import { parsePartnerSteamIdFromDocument } from '../shared/parse-trade-partner-steamid.js';


const PANEL_ID = 'rip-market-trade-verification-panel';
const STICKY_ID = 'rip-market-anti-scam-sticky';
const STEAM_INCOMING_OFFERS_URL = 'https://steamcommunity.com/my/tradeoffers/';
const STEAM_ITEM_IMAGE_CDN =
  'https://community.cloudflare.steamstatic.com/economy/image';

let overlayLocale: ExtensionLocale = 'ru';
let t = createExtensionT(overlayLocale);
/** I5: guided buyer assists; mismatch overlay stays on when false. */
let guidedBuyerEnabled = true;

async function ensureOverlayLocale(): Promise<void> {
  overlayLocale = await getStoredExtensionLocale();
  t = createExtensionT(overlayLocale);
}

async function refreshGuidedBuyerFlag(): Promise<void> {
  guidedBuyerEnabled = await isExtensionGuidedBuyerEnabled();
}

type AcceptAssistUiState = {
  offerId: string;
  phase: OfferAcceptAssistPhase;
  errorMessage?: string | null;
  lastClickedKind?: SteamAcceptControlKind | null;
};

type OfferPageContext = {
  trade: TradeVerificationResult | null;
  observed: ObservedOfferSnapshot | null;
  slots: OfferSlotSnapshot;
  offerId: string | null;
};

let acceptAssistUi: AcceptAssistUiState | null = null;
let lastPanelContext: OfferPageContext | null = null;

function rerenderOfferPanel(): void {
  if (lastPanelContext) {
    replacePanel(lastPanelContext);
  }
}

function preferredSteamAcceptKind(): SteamAcceptControlKind {
  return acceptAssistUi?.lastClickedKind === 'accept' ? 'confirm' : 'accept';
}

function armManualAcceptAssist(trade: TradeVerificationResult): void {
  const offerId = trade.offerId?.trim();
  if (!offerId || !canShowManualAcceptAssist(trade)) {
    return;
  }
  const control = pickSteamAcceptControl(
    findSteamAcceptControls(document),
    preferredSteamAcceptKind(),
  );
  if (!control) {
    acceptAssistUi = {
      offerId,
      phase: 'error',
      errorMessage:
        'Кнопка Accept в Steam не найдена. Нажмите зелёную Accept на странице вручную.',
    };
    rerenderOfferPanel();
    return;
  }
  highlightSteamAcceptControl(control);
  acceptAssistUi = { offerId, phase: 'armed', lastClickedKind: acceptAssistUi?.lastClickedKind };
  rerenderOfferPanel();
}

function cancelManualAcceptAssist(trade: TradeVerificationResult): void {
  const offerId = trade.offerId?.trim();
  clearSteamAcceptHighlights(document);
  acceptAssistUi = offerId
    ? { offerId, phase: 'ready', lastClickedKind: acceptAssistUi?.lastClickedKind }
    : null;
  rerenderOfferPanel();
}

function confirmManualAcceptAssist(trade: TradeVerificationResult): void {
  const offerId = trade.offerId?.trim();
  if (!offerId || !canShowManualAcceptAssist(trade)) {
    return;
  }
  if (acceptAssistUi?.offerId !== offerId || acceptAssistUi.phase !== 'armed') {
    armManualAcceptAssist(trade);
    return;
  }
  const control = pickSteamAcceptControl(
    findSteamAcceptControls(document),
    preferredSteamAcceptKind(),
  );
  const result = clickSteamAcceptControl(control, overlayLocale);
  clearSteamAcceptHighlights(document);
  if (!result.ok) {
    acceptAssistUi = {
      offerId,
      phase: 'error',
      errorMessage: result.error,
      lastClickedKind: acceptAssistUi.lastClickedKind,
    };
    rerenderOfferPanel();
    return;
  }
  acceptAssistUi = {
    offerId,
    phase: 'done',
    lastClickedKind: result.kind,
  };
  rerenderOfferPanel();
  if (!trade.acknowledgments.buyerPreAccept) {
    void runtimeRequest<{ ok: boolean }>({
      type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
      orderId: trade.orderId,
      ackType: 'BUYER_ACK_PRE_ACCEPT',
      offerId,
      idempotencyKey: `ack:${trade.orderId}:BUYER_ACK_PRE_ACCEPT:assist`,
    } satisfies AckTradeRuntimeRequest).catch(() => undefined);
  }
}

function parseOfferIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/tradeoffer\/(\d+)/i);
  return match?.[1] ?? null;
}

function formatMoneyMinor(amountMinor: string): string {
  const value = Number(amountMinor) / 100;
  if (!Number.isFinite(value)) {
    return amountMinor;
  }
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function statusClass(status: TradeVerificationResult['verificationStatus']): string {
  if (status === 'verified') return 'rip-verified';
  if (status === 'mismatch') return 'rip-mismatch';
  if (status === 'partial') return 'rip-partial';
  return 'rip-pending';
}

function getItemImageUrl(iconUrl: string | null): string | null {
  if (!iconUrl) {
    return null;
  }
  const normalized = iconUrl.replace(/^\//, '');
  return `${STEAM_ITEM_IMAGE_CDN}/${normalized}`;
}

async function runtimeRequest<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function resolveObservedFloat(assetId: string): Promise<string | null> {
  const response = await runtimeRequest<{ ok: boolean; floatValue?: string | null }>({
    type: TRADE_VERIFICATION_RUNTIME.RESOLVE_ASSET_FLOAT,
    assetId,
  });
  return response.ok ? (response.floatValue ?? null) : null;
}

async function resolveObservedFromPage(): Promise<ObservedOfferSnapshot | null> {
  const role = detectTradePageRole(window.location.pathname);
  const observedItem = parseObservedItemFromTradePage(role);
  const partnerSteamId = parsePartnerSteamIdFromDocument(
    document,
    window.location.href,
  );

  if (!observedItem?.assetId && !partnerSteamId) {
    return null;
  }

  const floatValue = observedItem?.assetId
    ? await resolveObservedFloat(observedItem.assetId)
    : null;
  return {
    assetId: observedItem?.assetId ?? null,
    marketHashName: observedItem?.marketHashName ?? null,
    floatValue: floatValue ?? null,
    partnerSteamId,
  };
}

function readSlotsFromPage(): OfferSlotSnapshot {
  return parseOfferSlotSnapshot(document);
}

async function loadTradeForPage(): Promise<OfferPageContext | null> {
  const offerId = parseOfferIdFromPath(window.location.pathname);
  const observed = await resolveObservedFromPage();
  const slots = readSlotsFromPage();
  const observedPayload = {
    ...(observed?.assetId ? { observedAssetId: observed.assetId } : {}),
    ...(observed?.floatValue ? { observedFloatValue: observed.floatValue } : {}),
    ...(observed?.partnerSteamId
      ? { observedPartnerSteamId: observed.partnerSteamId }
      : {}),
  };

  if (offerId) {
    const verified = await runtimeRequest<{ ok: boolean; trade?: TradeVerificationResult }>({
      type: TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE,
      offerId,
      ...observedPayload,
    });
    if (verified.ok && verified.trade) {
      return { trade: verified.trade, observed, slots, offerId };
    }
  }

  const active = await runtimeRequest<{ ok: boolean; trades: TradeVerificationResult[] }>({
    type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
  });
  const trades = active.ok ? active.trades : [];

  if (offerId) {
    const fallback = trades.find((trade) => trade.offerId === offerId) ?? null;
    if (!fallback) {
      // B3: still show anti-scam gate for foreign / unlinked offers.
      return { trade: null, observed, slots, offerId };
    }
    if (
      !observedPayload.observedAssetId &&
      !observedPayload.observedFloatValue &&
      !observedPayload.observedPartnerSteamId
    ) {
      return { trade: fallback, observed, slots, offerId };
    }
    const reverified = await runtimeRequest<{ ok: boolean; trade?: TradeVerificationResult }>({
      type: TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE,
      orderId: fallback.orderId,
      offerId,
      ...observedPayload,
    });
    return {
      trade: reverified.ok && reverified.trade ? reverified.trade : fallback,
      observed,
      slots,
      offerId,
    };
  }

  if (window.location.pathname.includes('/tradeoffer/new')) {
    const trade =
      trades.find(
        (entry) =>
          entry.role === 'seller' &&
          entry.orderStatus === 'WAITING_TRADE' &&
          !entry.offerId,
      ) ?? null;
    return trade ? { trade, observed, slots, offerId: null } : null;
  }

  return null;
}

function collectAntiScamWarnings(context: OfferPageContext): AntiScamWarning[] {
  return evaluateAntiScamRules({
    hasLinkedActiveOrder: Boolean(context.trade),
    role: context.trade?.role ?? detectTradePageRole(window.location.pathname),
    slots: context.slots,
    includeStickyHint: true,
  });
}

function renderAntiScamWarnings(warnings: AntiScamWarning[]): string {
  const actionable = warnings.filter((warning) => warning.id !== 'never_accept_from_chat');
  if (actionable.length === 0) {
    return '';
  }
  return `
    <div class="scam-rules" data-testid="anti-scam-rules">
      <p class="scam-rules-title">Anti-scam</p>
      ${actionable
        .map(
          (warning) => `
        <div class="scam-rule severity-${warning.severity}">
          <p class="scam-rule-title">${escapeHtml(warning.title)}</p>
          <p class="scam-rule-body">${escapeHtml(warning.body)}</p>
        </div>`,
        )
        .join('')}
    </div>`;
}

function ensureStickyHint(): void {
  if (!document.getElementById('rip-market-anti-scam-sticky-style')) {
    const style = document.createElement('style');
    style.id = 'rip-market-anti-scam-sticky-style';
    style.textContent = `
      #${STICKY_ID} {
        position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 2147483645;
        max-width: 520px; margin: 0 auto; padding: 10px 14px; border-radius: 10px;
        background: rgba(18,22,30,.96); color: #f0d78a; border: 1px solid rgba(111,93,47,.65);
        font-family: "Segoe UI", system-ui, sans-serif; font-size: 12px; line-height: 1.4;
        box-shadow: 0 10px 28px rgba(0,0,0,.45); pointer-events: none;
      }
    `;
    document.documentElement.appendChild(style);
  }
  let sticky = document.getElementById(STICKY_ID);
  if (!sticky) {
    sticky = document.createElement('div');
    sticky.id = STICKY_ID;
    document.documentElement.appendChild(sticky);
  }
  sticky.textContent = antiScamStickyShort();
}

function renderFailedChecks(trade: TradeVerificationResult): string {
  const failed = trade.checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return '';
  }
  return `<ul class="checks">${failed
    .map((check) => {
      const icon = check.severity === 'error' ? '✕' : '•';
      return `<li class="${check.severity}">${icon} ${escapeHtml(check.label)}</li>`;
    })
    .join('')}</ul>`;
}

function renderCompareTable(model: DealShieldModel): string {
  const rows = model.compareRows;
  if (rows.length === 0) {
    return '';
  }

  return `
    <div class="compare">
      <p class="compare-title">${escapeHtml(t('shield.compareTitle'))}</p>
      <div class="compare-head">
        <span></span>
        <span>${escapeHtml(t('shield.expectedCol'))}</span>
        <span>${escapeHtml(t('shield.observedCol'))}</span>
      </div>
      ${rows
        .map(
          (row) => `
        <div class="compare-row tone-${row.tone}">
          <span class="compare-label">${escapeHtml(row.label)}</span>
          <span class="compare-expected">${escapeHtml(row.expected)}</span>
          <span class="compare-observed">${escapeHtml(row.observed)}</span>
        </div>`,
        )
        .join('')}
    </div>`;
}

function renderPartnerBlock(model: DealShieldModel): string {
  const steamId = model.partner.steamId;
  const avatar = model.partner.avatarUrl
    ? `<img class="partner-avatar" src="${escapeHtml(model.partner.avatarUrl)}" alt="" />`
    : `<div class="partner-avatar-fallback" aria-hidden="true">${escapeHtml(
        model.partner.displayName.slice(0, 1).toUpperCase(),
      )}</div>`;
  const matchTone =
    model.partner.match === 'match'
      ? 'ok'
      : model.partner.match === 'mismatch'
        ? 'error'
        : 'warn';
  const profile = model.partner.profileUrl
    ? `<a class="partner-link" href="${escapeHtml(model.partner.profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('shield.openProfile'))}</a>`
    : '';

  return `
    <div class="partner">
      <div class="partner-top">
        ${avatar}
        <div class="partner-copy">
          <p class="partner-label">${escapeHtml(model.counterpartyRoleLabel)}</p>
          <p class="partner-name">${escapeHtml(model.partner.displayName)}</p>
          <p class="partner-match tone-${matchTone}">${escapeHtml(model.partner.matchLabel)}</p>
        </div>
      </div>
      <div class="partner-row">
        <span class="partner-id" data-steamid>${
          steamId
            ? escapeHtml(steamId)
            : escapeHtml(t('shield.steamIdMissing'))
        }</span>
        ${
          steamId
            ? `<button type="button" class="copy-btn" data-action="copy-steamid">${escapeHtml(t('shield.copySteamId'))}</button>`
            : ''
        }
        ${profile}
      </div>
    </div>`;
}

function renderItemHero(model: DealShieldModel): string {
  const imageUrl = getItemImageUrl(model.item.iconUrl);
  const lines =
    model.item.lines.length > 0
      ? `<ul class="item-lines">${model.item.lines
          .map(
            (line) =>
              `<li><span class="item-line-label">${escapeHtml(line.label)}</span> ${escapeHtml(line.value)}</li>`,
          )
          .join('')}</ul>`
      : '';
  return `
    <div class="hero">
      ${
        imageUrl
          ? `<img class="preview" src="${escapeHtml(imageUrl)}" alt="" />`
          : `<div class="preview-fallback">CS2</div>`
      }
      <div>
        <p class="item-name">${escapeHtml(model.item.marketHashName)}</p>
        <p class="meta">${escapeHtml(
          t('shield.dealLine', {
            short: model.orderShortId,
            amount: model.amountLabel,
          }),
        )}</p>
        ${lines}
      </div>
    </div>`;
}

function primaryCtaHtml(
  trade: TradeVerificationResult,
  shield: DealShieldModel,
): string {
  const status = shield.effectiveStatus;
  const onOfferPage = Boolean(parseOfferIdFromPath(window.location.pathname));

  if (
    status === 'mismatch' ||
    trade.orderStatus === 'DISPUTE' ||
    shield.partner.match === 'mismatch'
  ) {
    const supportUrl = buildInFlowDisputeSupportUrl(trade);
    const isOpenDispute = trade.orderStatus === 'DISPUTE';
    return `
      <p class="primary-hint block">${
        isOpenDispute
          ? escapeHtml(t('dispute.openTitle'))
          : shield.partner.match === 'mismatch'
            ? escapeHtml(t('shield.partnerMismatch'))
            : escapeHtml(t('guided.hintBlock'))
      }</p>
      <a class="btn danger" href="${escapeHtml(supportUrl)}" target="_blank" rel="noreferrer">${
        isOpenDispute
          ? escapeHtml(t('cta.openDisputeSupport'))
          : escapeHtml(t('cta.openDispute'))
      }</a>
      <a class="btn secondary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openOrder'))}</a>`;
  }

  if (
    guidedBuyerEnabled &&
    trade.role === 'buyer' &&
    onOfferPage &&
    canShowManualAcceptAssist({
      ...trade,
      verificationStatus: status,
    }) &&
    shield.partner.match === 'match'
  ) {
    const phase =
      acceptAssistUi?.offerId === trade.offerId
        ? acceptAssistUi.phase
        : 'ready';
    const view = buildOfferAcceptAssistView({
      phase,
      errorMessage: acceptAssistUi?.errorMessage,
      lastClickedKind: acceptAssistUi?.lastClickedKind,
      locale: overlayLocale,
    });
    const primaryAction =
      view.phase === 'armed' ? 'accept-steam-confirm' : 'accept-steam';
    const primaryClass =
      view.phase === 'armed' ? 'btn danger' : 'btn primary accept-cta';
    const secondary =
      view.secondaryLabel != null
        ? `<button type="button" class="btn secondary" data-action="accept-steam-cancel">${escapeHtml(view.secondaryLabel)}</button>`
        : '';
    return `
      <p class="primary-hint ${view.tone === 'error' ? 'block' : view.tone === 'warn' ? 'wait' : 'accept'}">${escapeHtml(view.hint)}</p>
      <button type="button" class="${primaryClass}" data-action="${primaryAction}">${escapeHtml(view.primaryLabel)}</button>
      ${secondary}`;
  }

  if (trade.role === 'buyer' && onOfferPage) {
    const hint = buyerOfferPagePrimaryHint(status, overlayLocale);
    if (hint.kind === 'accept_steam') {
      return `<p class="primary-hint accept">${escapeHtml(hint.text)}</p>`;
    }
    return `<p class="primary-hint wait">${escapeHtml(hint.text)}</p>`;
  }

  if (trade.role === 'buyer') {
    return `<a class="btn primary" href="${STEAM_INCOMING_OFFERS_URL}" target="_blank" rel="noreferrer">Открыть входящие предложения</a>`;
  }

  if (trade.nextAction.kind === 'confirm_guard') {
    return `<p class="primary-hint wait">Подтвердите отправку в Steam Guard на телефоне. Расширение Guard не подтверждает — статус обновится сам.</p>`;
  }

  if (trade.nextAction.kind === 'platform_verifying') {
    return `<p class="primary-hint wait">${escapeHtml(trade.nextAction.title)} — ${escapeHtml(trade.nextAction.description)}</p>`;
  }

  if (trade.nextAction.kind === 'send_manual') {
    const tradeUrl = trade.buyerTradeUrl?.trim();
    if (tradeUrl) {
      return `<a class="btn primary" href="${escapeHtml(tradeUrl)}" target="_blank" rel="noreferrer">Открыть Trade URL покупателя</a>`;
    }
    return `<a class="btn primary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">Открыть заказ — отправить вручную</a>`;
  }

  if (!trade.offerId) {
    return `<p class="primary-hint wait">Расширение отправит обмен само — ничего нажимать не нужно</p>`;
  }

  return `<p class="primary-hint wait">Ждём покупателя — обмен уже ушёл</p>`;
}

const PANEL_STYLES = `
      .panel {
        position: fixed; top: 72px; right: 16px; z-index: 2147483646;
        width: min(400px, calc(100vw - 32px)); border-radius: 14px; padding: 14px;
        font-family: "Segoe UI", system-ui, sans-serif; color: #e8e8e8; background: #12161e;
        border: 1px solid #2f3542; box-shadow: 0 16px 48px rgba(0,0,0,.5);
      }
      .rip-verified { border-color: #2f6f46; }
      .rip-mismatch, .rip-scam-block { border-color: #8f3d3d; box-shadow: 0 16px 48px rgba(143,61,61,.35); }
      .rip-partial { border-color: #6f5d2f; }
      .gate-banner {
        margin: 0 0 12px; padding: 12px; border-radius: 10px;
        background: #1a2030; border: 1px solid #2a3140;
      }
      .gate-banner.ok { background: rgba(47,111,70,.18); border-color: rgba(47,111,70,.45); }
      .gate-banner.error { background: rgba(143,61,61,.22); border-color: rgba(143,61,61,.55); }
      .gate-banner.warn { background: rgba(111,93,47,.2); border-color: rgba(111,93,47,.5); }
      .gate-banner.pending { background: rgba(42,47,58,.55); }
      .gate-title {
        margin: 0 0 4px; font-size: 16px; font-weight: 800; line-height: 1.25; letter-spacing: .01em;
      }
      .gate-banner.ok .gate-title { color: #8fe6a4; }
      .gate-banner.error .gate-title { color: #f0a8a8; }
      .gate-banner.warn .gate-title { color: #f0d78a; }
      .gate-sub { margin: 0; font-size: 12px; color: #c7ccd6; line-height: 1.4; }
      .hero {
        display: grid; grid-template-columns: 72px 1fr; gap: 12px;
        align-items: center; margin-bottom: 10px;
      }
      .preview {
        width: 72px; height: 54px; border-radius: 8px; object-fit: contain;
        background: #0b0e14; border: 1px solid #2a3140;
      }
      .preview-fallback {
        width: 72px; height: 54px; border-radius: 8px; display: grid; place-items: center;
        background: #0b0e14; border: 1px solid #2a3140; color: #7d8594; font-size: 11px;
      }
      .item-name { font-size: 13px; font-weight: 700; margin: 0 0 2px; line-height: 1.3; }
      .meta { font-size: 11px; color: #7d8594; margin: 0; }
      .escrow {
        margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
        background: rgba(47,111,70,.16); border: 1px solid rgba(47,111,70,.35);
        font-size: 12px; color: #8fe6a4; line-height: 1.35;
      }
      .escrow strong { color: #b8f5c6; }
      .compare {
        display: grid; gap: 4px; margin: 0 0 10px;
        padding: 8px; border-radius: 8px; background: #0b0e14; border: 1px solid #2a3140;
      }
      .compare-head, .compare-row {
        display: grid; grid-template-columns: 72px 1fr 1fr; gap: 6px; align-items: start;
      }
      .compare-head { font-size: 10px; color: #7d8594; text-transform: uppercase; letter-spacing: .04em; }
      .compare-label { font-size: 11px; color: #a8adb8; }
      .compare-expected, .compare-observed {
        font-size: 11px; color: #c7ccd6; word-break: break-word; line-height: 1.35;
      }
      .tone-ok .compare-observed { color: #8fe6a4; }
      .tone-error .compare-observed { color: #f0a8a8; font-weight: 700; }
      .tone-warn .compare-observed { color: #f0d78a; }
      .partner {
        display: grid; gap: 8px; margin: 0 0 10px; padding: 10px;
        border-radius: 8px; background: #1a2030; border: 1px solid #2a3140;
      }
      .partner-top { display: flex; gap: 10px; align-items: center; }
      .partner-avatar {
        width: 40px; height: 40px; border-radius: 50%; object-fit: cover;
        border: 1px solid #2a3140; background: #0b0e14; flex-shrink: 0;
      }
      .partner-avatar-fallback {
        width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
        background: #0b0e14; border: 1px solid #2a3140; color: #a8adb8;
        font-size: 14px; font-weight: 700; flex-shrink: 0;
      }
      .partner-copy { min-width: 0; flex: 1; }
      .partner-label { font-size: 10px; color: #7d8594; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
      .partner-name { font-size: 13px; font-weight: 700; margin: 2px 0; color: #e8e8e8; }
      .partner-match { font-size: 11px; margin: 0; }
      .partner-match.tone-ok { color: #8fe6a4; }
      .partner-match.tone-warn { color: #f0d78a; }
      .partner-match.tone-error { color: #f0a8a8; font-weight: 700; }
      .partner-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .partner-id {
        flex: 1; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #e8e8e8; word-break: break-all; min-width: 120px;
      }
      .partner-link {
        font-size: 11px; color: #b7d0ff; text-decoration: none;
        border: 1px solid #3d5f8f; border-radius: 6px; padding: 6px 8px;
      }
      .partner-link:hover { background: rgba(91,141,239,.16); }
      .item-lines {
        margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 2px;
      }
      .item-lines li { font-size: 11px; color: #a8adb8; margin: 0; }
      .item-line-label { color: #7d8594; }
      .pre-send {
        margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
        background: rgba(91,141,239,.12); border: 1px solid rgba(91,141,239,.35);
      }
      .pre-send-title { margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #d7e4ff; }
      .pre-send-body { margin: 0; font-size: 11px; color: #a8adb8; line-height: 1.4; }
      .compare-title {
        margin: 0 0 6px; font-size: 10px; letter-spacing: .06em;
        text-transform: uppercase; color: #7d8594;
      }
      .copy-btn {
        flex-shrink: 0; border: none; border-radius: 6px; padding: 6px 8px;
        background: #2a2f3a; color: #e8e8e8; font-size: 11px; cursor: pointer;
      }
      .copy-btn:hover { background: #343b4a; }
      .checks { margin: 0 0 10px; padding: 0; list-style: none; }
      .checks li { font-size: 12px; margin: 4px 0; color: #c7ccd6; }
      .checks li.error { color: #f0a8a8; }
      .checks li.warn { color: #f0d78a; }
      .scam-rules { display: grid; gap: 8px; margin: 0 0 10px; }
      .scam-rules-title {
        margin: 0; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #7d8594;
      }
      .scam-rule {
        padding: 8px 10px; border-radius: 8px; border: 1px solid #2a3140; background: #0b0e14;
      }
      .scam-rule.severity-block {
        background: rgba(143,61,61,.18); border-color: rgba(143,61,61,.5);
      }
      .scam-rule.severity-warn {
        background: rgba(111,93,47,.18); border-color: rgba(111,93,47,.5);
      }
      .scam-rule-title { margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #e8e8e8; }
      .severity-block .scam-rule-title { color: #f0a8a8; }
      .severity-warn .scam-rule-title { color: #f0d78a; }
      .scam-rule-body { margin: 0; font-size: 11px; color: #c7ccd6; line-height: 1.4; }
      .primary-hint {
        margin: 0 0 10px; padding: 10px 12px; border-radius: 8px;
        font-size: 13px; font-weight: 700; text-align: center; line-height: 1.35;
      }
      .primary-hint.accept {
        background: rgba(47,111,70,.22); border: 1px solid rgba(47,111,70,.45); color: #8fe6a4;
      }
      .primary-hint.wait {
        background: rgba(91,141,239,.16); border: 1px solid rgba(91,141,239,.35); color: #d7e4ff;
      }
      .primary-hint.block {
        background: rgba(143,61,61,.22); border: 1px solid rgba(143,61,61,.5); color: #f0a8a8;
      }
      .actions { display: grid; gap: 8px; }
      button, a.btn {
        display: block; text-align: center; text-decoration: none; border: none;
        border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer;
      }
      .primary { background: #5b8def; color: #fff; }
      .primary.accept-cta { background: #2f6f46; }
      .primary.accept-cta:hover { background: #3a8556; }
      .secondary { background: #2a2f3a; color: #e8e8e8; }
      .danger { background: #8f3d3d; color: #fff; }
      .primary:disabled, .secondary:disabled { opacity: .55; cursor: not-allowed; }
      details.ack {
        margin-top: 4px; border-top: 1px solid #2a3140; padding-top: 8px;
      }
      details.ack summary {
        cursor: pointer; font-size: 12px; color: #a8adb8; user-select: none;
      }
      details.ack .ack-body { display: grid; gap: 8px; margin-top: 8px; }
      details.ack .ack-note { margin: 0; font-size: 11px; color: #7d8594; }
      .never-auto {
        margin: 8px 0 0; font-size: 10px; color: #7d8594; text-align: center;
      }
`;

function buildUnlinkedPanel(context: OfferPageContext): HTMLElement {
  const host = document.createElement('div');
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const warnings = collectAntiScamWarnings(context);
  const offerLabel = context.offerId ? `#${context.offerId}` : 'этот offer';

  shadow.innerHTML = `
    <style>${PANEL_STYLES}</style>
    <div class="panel rip-scam-block">
      <div class="gate-banner error">
        <p class="gate-title">Не наша сделка — не принимайте</p>
        <p class="gate-sub">Offer ${escapeHtml(offerLabel)} не привязан к активному заказу R.I.P Market.</p>
      </div>
      ${renderAntiScamWarnings(warnings)}
      <div class="actions">
        <p class="primary-hint block">Не нажимайте Accept в Steam</p>
        <a class="btn secondary" href="${STEAM_INCOMING_OFFERS_URL}" target="_blank" rel="noreferrer">К списку предложений</a>
      </div>
      <p class="never-auto">R.I.P Market никогда не нажимает Accept за вас</p>
    </div>
  `;
  return host;
}

function buildPanel(context: OfferPageContext): HTMLElement {
  if (!context.trade) {
    return buildUnlinkedPanel(context);
  }

  const { trade: rawTrade, observed } = context;
  const host = document.createElement('div');
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const isPreSendPage = window.location.pathname.includes('/tradeoffer/new');
  const shield = buildDealShieldModel({
    trade: rawTrade,
    observed,
    locale: overlayLocale,
    isPreSend: isPreSendPage && rawTrade.role === 'seller',
  });
  const trade = applyPartnerObservation(
    rawTrade,
    observed?.partnerSteamId,
    overlayLocale,
  );
  const status = shield.effectiveStatus;
  const headline = shield.headline;
  const steamId = shield.partner.steamId;
  const onOfferPage = Boolean(parseOfferIdFromPath(window.location.pathname));
  const warnings = collectAntiScamWarnings(context);
  const scamBlocks = antiScamHasBlocking(warnings);

  const showPreAccept =
    trade.role === 'buyer' &&
    trade.orderStatus === 'WAITING_TRADE' &&
    status !== 'mismatch' &&
    !scamBlocks &&
    !trade.acknowledgments.buyerPreAccept &&
    !trade.acknowledgments.buyerReceived &&
    Boolean(trade.offerId);
  const showConfirmReceived =
    trade.role === 'buyer' &&
    status !== 'mismatch' &&
    !scamBlocks &&
    Boolean(trade.offerId) &&
    !trade.acknowledgments.buyerReceived &&
    (trade.orderStatus === 'WAITING_TRADE' ||
      trade.orderStatus === 'TRADE_CONFIRMED' ||
      trade.orderStatus === 'SETTLEMENT_HOLD');
  const showSellerAckSent =
    trade.role === 'seller' &&
    trade.orderStatus === 'WAITING_TRADE' &&
    status !== 'mismatch' &&
    Boolean(trade.offerId) &&
    !trade.acknowledgments.sellerAckSent &&
    trade.nextAction.kind !== 'confirm_guard';
  const showAckSection = showSellerAckSent || showPreAccept || showConfirmReceived;

  const acceptAllowed =
    canShowManualAcceptAssist({
      ...trade,
      verificationStatus: status,
    }) &&
    shield.partner.match === 'match' &&
    !scamBlocks;

  const buyerCtaOverride =
    trade.role === 'buyer' && onOfferPage && scamBlocks && status !== 'mismatch'
      ? `<p class="primary-hint block">Сначала устраните anti-scam предупреждения — Accept пока не нажимайте</p>`
      : primaryCtaHtml(trade, shield);

  const preSendBanner = shield.isPreSend
    ? `<div class="pre-send">
        <p class="pre-send-title">${escapeHtml(t('shield.preSendTitle'))}</p>
        <p class="pre-send-body">${escapeHtml(t('shield.preSendBody'))}</p>
      </div>`
    : '';

  shadow.innerHTML = `
    <style>${PANEL_STYLES}</style>
    <div class="panel ${statusClass(status)}${scamBlocks ? ' rip-scam-block' : ''}">
      <div class="gate-banner ${scamBlocks && status !== 'mismatch' ? 'error' : headline.tone}">
        <p class="gate-title">${escapeHtml(
          scamBlocks && status !== 'mismatch'
            ? 'Стоп — риск скама'
            : headline.title,
        )}</p>
        <p class="gate-sub">${escapeHtml(
          scamBlocks && status !== 'mismatch'
            ? 'В оффере есть признаки опасной подмены. Не принимайте, пока предупреждения не сняты.'
            : headline.subtitle,
        )}</p>
      </div>
      ${preSendBanner}
      ${renderItemHero(shield)}
      ${renderPartnerBlock(shield)}
      ${
        trade.escrow.status === 'active'
          ? `<p class="escrow"><strong>Деньги на площадке:</strong> hold ${formatMoneyMinor(trade.escrow.holdAmountMinor)}. Не платите продавцу в чат Steam.</p>`
          : `<p class="escrow"><strong>Оплата на площадке.</strong> Не переводите деньги в чат Steam.</p>`
      }
      ${renderAntiScamWarnings(warnings)}
      ${onOfferPage || isPreSendPage ? renderCompareTable(shield) : ''}
      ${renderFailedChecks(trade)}
      <div class="actions">
        ${buyerCtaOverride}
        ${
          status !== 'mismatch' && shield.partner.match !== 'mismatch'
            ? `<a class="btn secondary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openOrder'))}</a>`
            : ''
        }
        ${
          showAckSection
            ? `<details class="ack">
                <summary>Если статус на сайте не обновился</summary>
                <div class="ack-body">
                  <p class="ack-note">Эти кнопки не заменяют действие в Steam — только помогают сайту сверить статус.</p>
                  ${showSellerAckSent ? '<button class="secondary" data-action="seller-sent">Я отправил обмен</button>' : ''}
                  ${showPreAccept ? '<button class="secondary" data-action="pre-accept">Вижу предложение</button>' : ''}
                  ${showConfirmReceived ? '<button class="secondary" data-action="confirm-received">Предмет получен</button>' : ''}
                </div>
              </details>`
            : ''
        }
      </div>
      <p class="never-auto">${
        trade.role === 'buyer' && onOfferPage && acceptAllowed
          ? 'Accept в Steam — только после вашего двойного подтверждения. Автоматом не принимаем.'
          : 'R.I.P Market никогда не нажимает Accept за вас'
      }</p>
    </div>
  `;

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="copy-steamid"]')
    ?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (!steamId) {
        return;
      }
      void navigator.clipboard.writeText(steamId).then(
        () => {
          button.textContent = t('shield.copied');
          window.setTimeout(() => {
            button.textContent = t('shield.copySteamId');
          }, 1600);
        },
        () => {
          button.textContent = 'Ошибка';
        },
      );
    });

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="seller-sent"]')
    ?.addEventListener('click', (event) => {
      void acknowledgeSellerSent(trade, event.currentTarget as HTMLButtonElement);
    });

  shadow.querySelector<HTMLButtonElement>('button[data-action="pre-accept"]')?.addEventListener(
    'click',
    (event) => {
      void acknowledgePreAccept(trade, event.currentTarget as HTMLButtonElement);
    },
  );

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="confirm-received"]')
    ?.addEventListener('click', (event) => {
      void acknowledgeReceived(trade, event.currentTarget as HTMLButtonElement);
    });

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="accept-steam"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault();
      armManualAcceptAssist(trade);
    });

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="accept-steam-confirm"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault();
      confirmManualAcceptAssist(trade);
    });

  shadow
    .querySelector<HTMLButtonElement>('button[data-action="accept-steam-cancel"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault();
      cancelManualAcceptAssist(trade);
    });

  return host;
}

async function acknowledgeSellerSent(
  trade: TradeVerificationResult,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  button.textContent = 'Сохраняем…';
  const response = await runtimeRequest<{ ok: boolean; error?: string }>({
    type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
    orderId: trade.orderId,
    ackType: 'SELLER_ACK_SENT',
    offerId: trade.offerId ?? undefined,
    idempotencyKey: `ack:${trade.orderId}:SELLER_ACK_SENT`,
  } satisfies AckTradeRuntimeRequest);

  button.textContent = response.ok
    ? 'Отправка подтверждена ✓'
    : (response.error ?? 'Не удалось подтвердить');
  button.disabled = response.ok;
}

async function acknowledgeReceived(
  trade: TradeVerificationResult,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  button.textContent = 'Сохраняем…';
  const response = await runtimeRequest<{ ok: boolean; error?: string }>({
    type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
    orderId: trade.orderId,
    ackType: 'BUYER_ACK_RECEIVED',
    offerId: trade.offerId ?? undefined,
    idempotencyKey: `ack:${trade.orderId}:BUYER_ACK_RECEIVED`,
  } satisfies AckTradeRuntimeRequest);

  button.textContent = response.ok
    ? 'Предмет получен ✓'
    : (response.error ?? 'Не удалось подтвердить');
  button.disabled = response.ok;
}

async function acknowledgePreAccept(
  trade: TradeVerificationResult,
  button: HTMLButtonElement,
): Promise<void> {
  if (trade.verificationStatus === 'mismatch') {
    button.textContent = 'Обмен не совпадает';
    return;
  }

  button.disabled = true;
  button.textContent = 'Сохраняем…';
  const response = await runtimeRequest<{ ok: boolean; error?: string }>({
    type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
    orderId: trade.orderId,
    ackType: 'BUYER_ACK_PRE_ACCEPT',
    offerId: trade.offerId ?? undefined,
    idempotencyKey: `ack:${trade.orderId}:BUYER_ACK_PRE_ACCEPT`,
  } satisfies AckTradeRuntimeRequest);

  button.textContent = response.ok
    ? 'Вижу предложение ✓'
    : (response.error ?? 'Не удалось подтвердить');
  button.disabled = response.ok;
}

function replacePanel(context: OfferPageContext): void {
  lastPanelContext = context;
  document.getElementById(PANEL_ID)?.remove();
  document.documentElement.appendChild(buildPanel(context));
}

let refreshInFlight = false;

async function refreshPanel(): Promise<void> {
  if (refreshInFlight) {
    return;
  }
  refreshInFlight = true;
  try {
    await ensureOverlayLocale();
    await refreshGuidedBuyerFlag();
    const context = await loadTradeForPage();
    if (!context) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    ensureStickyHint();
    replacePanel(context);
  } finally {
    refreshInFlight = false;
  }
}

function watchTradeOfferDom(): void {
  const root =
    document.querySelector('#trade_slots') ??
    document.querySelector('.tradeoffer') ??
    document.body;
  const observer = new MutationObserver(() => {
    void refreshPanel();
  });
  observer.observe(root, { childList: true, subtree: true });
}

async function mountPanel(): Promise<void> {
  // List page is handled by trade-offers-list-bridge (B1 + B3 sticky).
  if (/\/tradeoffers\/?/i.test(window.location.pathname)) {
    return;
  }
  await ensureOverlayLocale();
  await refreshGuidedBuyerFlag();
  const context = await loadTradeForPage();
  if (!context) {
    return;
  }
  ensureStickyHint();
  replacePanel(context);
  watchTradeOfferDom();
}

void mountPanel();
