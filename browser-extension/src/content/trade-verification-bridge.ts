import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  TRADE_VERIFICATION_RUNTIME,
  type AckTradeRuntimeRequest,
} from '../shared/trade-verification-runtime.js';
import {
  detectTradePageRole,
  parseObservedItemFromTradePage,
} from '../shared/trade-offer-observed-item.js';
import { resolveSellerTradeOfferGate } from '../shared/seller-trade-offer-gate.js';
import {
  buyerOfferPagePrimaryHint,
  type ObservedOfferSnapshot,
} from '../shared/trade-offer-guided-gate.js';
import { buildInFlowDisputeSupportUrl } from '../shared/in-flow-dispute.js';
import { sanitizeTradeOrderUrl } from '../shared/site-origin.js';
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
import { resolveTradeForOfferPage } from '../shared/resolve-trade-for-offer-page.js';
import {
  buildDealConfirmBanner,
  dealConfirmBannerHtml,
  isDeliveryDualSignalOk,
  needsBuyerReceivedConfirm,
  resolveDealConfirmPhase,
} from '../shared/deal-confirm-flow.js';
import {
  bumpDealFlowMetric,
  type DealFlowMetricKey,
} from '../shared/deal-flow-metrics.js';
import {
  isExtensionContextInvalidatedError,
  isExtensionContextValid,
} from '../shared/extension-context.js';
import {
  detectSteamOfferPageLifecycle,
  isPostAcceptSteamLifecycle,
} from '../shared/steam-offer-page-lifecycle.js';


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

/** Avoid spamming chrome.storage on every panel refresh poll. */
const metricOnceKeys = new Set<string>();
function bumpMetricOnce(onceKey: string, metric: DealFlowMetricKey): void {
  if (metricOnceKeys.has(onceKey)) {
    return;
  }
  metricOnceKeys.add(onceKey);
  void bumpDealFlowMetric(metric);
}

const reportedSteamPageKeys = new Set<string>();

function maybeReportSteamOfferPage(trade: TradeVerificationResult): void {
  const offerId = trade.offerId?.trim();
  if (!offerId) {
    return;
  }
  const page = detectSteamOfferPageLifecycle(document);
  if (!isPostAcceptSteamLifecycle(page.lifecycle)) {
    return;
  }
  const key = `${trade.orderId}:${offerId}:${page.lifecycle}`;
  if (reportedSteamPageKeys.has(key)) {
    return;
  }
  reportedSteamPageKeys.add(key);
  void runtimeRequest<{ ok: boolean }>({
    type: TRADE_VERIFICATION_RUNTIME.REPORT_STEAM_OFFER_PAGE,
    orderId: trade.orderId,
    offerId,
    lifecycle: page.lifecycle === 'invalid' ? 'invalid' : 'accepted',
    idempotencyKey: `steam-page:${trade.orderId}:${offerId}:${page.lifecycle}`,
  }).catch(() => undefined);
}

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
  // Platform pre-accept should not force a site hop — fire when buyer starts Accept.
  if (!trade.acknowledgments.buyerPreAccept) {
    void runtimeRequest<{ ok: boolean }>({
      type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
      orderId: trade.orderId,
      ackType: 'BUYER_ACK_PRE_ACCEPT',
      offerId,
      idempotencyKey: `ack:${trade.orderId}:BUYER_ACK_PRE_ACCEPT:assist-arm`,
    } satisfies AckTradeRuntimeRequest).catch(() => undefined);
  }
  void bumpDealFlowMetric('accept_assist_armed');
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
  void bumpDealFlowMetric('accept_assist_done');
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
  if (!isExtensionContextValid()) {
    throw new Error('Extension context invalidated');
  }
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      throw error;
    }
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    throw error;
  }
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
    const fallback =
      resolveTradeForOfferPage({
        trades,
        offerId,
        observedAssetId: observed?.assetId,
        roleHint: 'buyer',
      }) ??
      resolveTradeForOfferPage({
        trades,
        offerId,
        observedAssetId: observed?.assetId,
        roleHint: 'seller',
      });
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
      // Prefer the canonical linked offer id when present so we do not stamp
      // a false offer_id warning from a duplicate Steam tab.
      offerId: fallback.offerId?.trim() || offerId,
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
          !entry.offerId &&
          // After submit/Guard, Steam often redirects back to /new. Do not treat
          // that as "create another offer" — confirm_guard means already in flight.
          entry.nextAction?.kind !== 'confirm_guard' &&
          entry.nextAction?.kind !== 'send_manual',
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

function renderAntiScamWarnings(
  warnings: AntiScamWarning[],
  options?: { compact?: boolean },
): string {
  const actionable = warnings.filter(
    (warning) => warning.id !== 'never_accept_from_chat',
  );
  if (actionable.length === 0) {
    return '';
  }

  const blocks = actionable.filter((warning) => warning.severity === 'block');
  const warns = actionable.filter((warning) => warning.severity === 'warn');
  const infos = actionable.filter((warning) => warning.severity === 'info');

  const renderCards = (list: AntiScamWarning[]) =>
    list
      .map(
        (warning) => `
        <div class="scam-rule severity-${warning.severity}">
          <p class="scam-rule-title">${escapeHtml(warning.title)}</p>
          <p class="scam-rule-body">${escapeHtml(warning.body)}</p>
        </div>`,
      )
      .join('');

  // Blocking risks always stay visible.
  const critical = renderCards(blocks);
  if (!options?.compact) {
    return `
    <div class="scam-rules" data-testid="anti-scam-rules">
      ${critical}
      ${renderCards(warns)}
      ${renderCards(infos)}
    </div>`;
  }

  // Quiet mode: only blocks inline; warns/info go behind details.
  const soft = [...warns, ...infos];
  const softHtml =
    soft.length > 0
      ? `<details class="more">
          <summary>Защита · ${soft.length}</summary>
          <div class="more-body">${renderCards(soft)}</div>
        </details>`
      : '';

  if (!critical && !softHtml) {
    return '';
  }

  return `
    <div class="scam-rules" data-testid="anti-scam-rules">
      ${critical}
      ${softHtml}
    </div>`;
}

function ensureStickyHint(): void {
  if (!document.getElementById('rip-market-anti-scam-sticky-style')) {
    const style = document.createElement('style');
    style.id = 'rip-market-anti-scam-sticky-style';
    style.textContent = `
      #${STICKY_ID} {
        position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 2147483645;
        max-width: 420px; margin: 0 auto; padding: 10px 14px; border-radius: 10px;
        background: rgba(24, 28, 38, 0.96); color: #fde047;
        border: 1px solid rgba(234, 179, 8, 0.35);
        font-family: Inter, system-ui, -apple-system, sans-serif;
        font-size: 12px; line-height: 1.4;
        box-shadow: 0 12px 32px rgba(0,0,0,.45); pointer-events: none;
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

function renderCompareSection(
  model: DealShieldModel,
  options: { forceOpen: boolean },
): string {
  const rows = model.compareRows;
  if (rows.length === 0) {
    return '';
  }

  const hasProblem = rows.some((row) => row.tone !== 'ok');
  const table = `
    <div class="compare">
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

  if (hasProblem || options.forceOpen) {
    return `
      <div class="compare-wrap">
        <p class="section-label">${escapeHtml(t('shield.compareTitle'))}</p>
        ${table}
      </div>`;
  }

  return `
    <details class="more">
      <summary>Сверка со Steam · всё совпадает</summary>
      <div class="more-body">
        <p class="section-label">${escapeHtml(t('shield.compareTitle'))}</p>
        ${table}
      </div>
    </details>`;
}

function renderPartnerBlock(
  model: DealShieldModel,
  options: { expandTools: boolean },
): string {
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

  const tools = `
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
      </div>`;

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
      ${
        options.expandTools
          ? tools
          : steamId
            ? `<details class="more partner-more">
                <summary>SteamID и профиль</summary>
                <div class="more-body">${tools}</div>
              </details>`
            : tools
      }
    </div>`;
}

function renderItemHero(model: DealShieldModel): string {
  const imageUrl = getItemImageUrl(model.item.iconUrl);
  return `
    <div class="hero">
      ${
        imageUrl
          ? `<img class="preview" src="${escapeHtml(imageUrl)}" alt="" />`
          : `<div class="preview-fallback">CS2</div>`
      }
      <div class="hero-copy">
        <p class="item-name">${escapeHtml(model.item.marketHashName)}</p>
        <p class="meta">${escapeHtml(
          t('shield.dealLine', {
            short: model.orderShortId,
            amount: model.amountLabel,
          }),
        )}</p>
      </div>
    </div>`;
}

function primaryCtaHtml(
  trade: TradeVerificationResult,
  shield: DealShieldModel,
  sellerGate: ReturnType<typeof resolveSellerTradeOfferGate> | null,
): string {
  const status = shield.effectiveStatus;
  const onOfferPage = Boolean(parseOfferIdFromPath(window.location.pathname));
  const onNewOfferPage = window.location.pathname.includes('/tradeoffer/new');

  if (
    status === 'mismatch' ||
    trade.orderStatus === 'DISPUTE' ||
    shield.partner.match === 'mismatch'
  ) {
    const supportUrl = buildInFlowDisputeSupportUrl(trade);
    const isOpenDispute = trade.orderStatus === 'DISPUTE';
    const orderHref = sanitizeTradeOrderUrl(trade.siteUrl, trade.orderId);
    if (isOpenDispute) {
      return `
      <p class="primary-hint block">${escapeHtml(t('dispute.openTitle'))}</p>
      <a class="btn primary" href="${escapeHtml(orderHref)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openOrder'))}</a>
      <a class="btn secondary" href="${escapeHtml(supportUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openDisputeSupport'))}</a>`;
    }
    return `
      <p class="primary-hint block">${
        shield.partner.match === 'mismatch'
          ? escapeHtml(t('shield.partnerMismatch'))
          : escapeHtml(t('guided.hintBlock'))
      }</p>
      <a class="btn danger" href="${escapeHtml(supportUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openDispute'))}</a>
      <a class="btn secondary" href="${escapeHtml(orderHref)}" target="_blank" rel="noreferrer">${escapeHtml(t('cta.openOrder'))}</a>`;
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

  if (trade.role === 'seller' && onNewOfferPage && sellerGate) {
    // Gate banner already carries the instruction — avoid repeating it.
    return '';
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
        --rip-bg: #0b0d12;
        --rip-elevated: rgba(24, 28, 38, 0.96);
        --rip-text: #f4f4f5;
        --rip-muted: #94a3b8;
        --rip-soft: #a8b0c0;
        --rip-border: rgba(255, 255, 255, 0.08);
        --rip-border-strong: rgba(255, 255, 255, 0.12);
        --rip-link: #7dd3fc;
        --rip-primary-from: #0284c7;
        --rip-primary-to: #2563eb;
        --rip-success: #86efac;
        --rip-success-bg: rgba(34, 197, 94, 0.14);
        --rip-warn: #fde047;
        --rip-warn-bg: rgba(234, 179, 8, 0.12);
        --rip-danger: #fecaca;
        --rip-danger-bg: rgba(239, 68, 68, 0.14);
        --rip-info-bg: rgba(56, 189, 248, 0.1);
        --rip-radius: 14px;
        --rip-radius-sm: 10px;

        position: fixed; top: 72px; right: 16px; z-index: 2147483646;
        width: min(360px, calc(100vw - 28px));
        padding: 14px;
        border-radius: var(--rip-radius);
        font-family: Inter, system-ui, -apple-system, sans-serif;
        color: var(--rip-text);
        background:
          radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 42%),
          var(--rip-elevated);
        border: 1px solid var(--rip-border);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.03);
        display: grid;
        gap: 8px;
      }
      .rip-verified { border-color: rgba(34, 197, 94, 0.35); }
      .rip-mismatch, .rip-scam-block { border-color: rgba(248, 113, 113, 0.4); }
      .rip-partial { border-color: rgba(234, 179, 8, 0.35); }

      .brand {
        display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
      }
      .brand-mark {
        margin: 0; font-size: 12px; font-weight: 700; letter-spacing: -0.02em; color: var(--rip-text);
      }
      .brand-chip {
        margin: 0; font-size: 10px; color: var(--rip-muted); letter-spacing: 0.04em; text-transform: uppercase;
      }

      .gate-banner {
        margin: 0; padding: 11px 12px; border-radius: var(--rip-radius-sm);
        background: rgba(15, 23, 42, 0.72); border: 1px solid var(--rip-border);
      }
      .gate-banner.ok {
        background: var(--rip-success-bg); border-color: rgba(34, 197, 94, 0.35);
      }
      .gate-banner.error {
        background: var(--rip-danger-bg); border-color: rgba(248, 113, 113, 0.4);
      }
      .gate-banner.warn {
        background: var(--rip-warn-bg); border-color: rgba(234, 179, 8, 0.4);
      }
      .gate-banner.pending { background: rgba(15, 23, 42, 0.8); }
      .gate-title {
        margin: 0 0 4px; font-size: 15px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em;
      }
      .gate-banner.ok .gate-title { color: var(--rip-success); }
      .gate-banner.error .gate-title { color: var(--rip-danger); }
      .gate-banner.warn .gate-title { color: var(--rip-warn); }
      .gate-sub { margin: 0; font-size: 12px; color: var(--rip-soft); line-height: 1.4; }

      .hero {
        display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center;
      }
      .preview {
        width: 56px; height: 42px; border-radius: 8px; object-fit: contain;
        background: #0b0d12; border: 1px solid var(--rip-border);
      }
      .preview-fallback {
        width: 56px; height: 42px; border-radius: 8px; display: grid; place-items: center;
        background: #0b0d12; border: 1px solid var(--rip-border); color: var(--rip-muted); font-size: 10px;
      }
      .hero-copy { min-width: 0; }
      .item-name {
        font-size: 13px; font-weight: 650; margin: 0 0 2px; line-height: 1.3;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .meta { font-size: 11px; color: var(--rip-muted); margin: 0; }

      .money {
        margin: 0; padding: 8px 10px; border-radius: 8px;
        background: var(--rip-success-bg); border: 1px solid rgba(34, 197, 94, 0.28);
        font-size: 12px; color: var(--rip-success); line-height: 1.35;
      }
      .money strong { color: #b8f5c6; font-weight: 650; }

      .partner {
        display: grid; gap: 6px; margin: 0; padding: 10px;
        border-radius: var(--rip-radius-sm);
        background: rgba(15, 23, 42, 0.55); border: 1px solid var(--rip-border);
      }
      .partner-top { display: flex; gap: 10px; align-items: center; }
      .partner-avatar {
        width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
        border: 1px solid var(--rip-border); background: #0b0d12; flex-shrink: 0;
      }
      .partner-avatar-fallback {
        width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
        background: #0b0d12; border: 1px solid var(--rip-border); color: var(--rip-soft);
        font-size: 13px; font-weight: 700; flex-shrink: 0;
      }
      .partner-copy { min-width: 0; flex: 1; }
      .partner-label {
        font-size: 10px; color: var(--rip-muted); margin: 0;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .partner-name { font-size: 13px; font-weight: 650; margin: 2px 0; color: var(--rip-text); }
      .partner-match { font-size: 11px; margin: 0; }
      .partner-match.tone-ok { color: var(--rip-success); }
      .partner-match.tone-warn { color: var(--rip-warn); }
      .partner-match.tone-error { color: var(--rip-danger); font-weight: 700; }
      .partner-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .partner-id {
        flex: 1; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: var(--rip-soft); word-break: break-all; min-width: 100px;
      }
      .partner-link {
        font-size: 11px; color: var(--rip-link); text-decoration: none;
        border: 1px solid rgba(125, 211, 252, 0.28); border-radius: 7px; padding: 5px 8px;
      }
      .partner-link:hover { background: rgba(56, 189, 248, 0.1); }
      .copy-btn {
        flex-shrink: 0; border: 1px solid var(--rip-border); border-radius: 7px; padding: 5px 8px;
        background: rgba(255,255,255,0.04); color: var(--rip-text); font-size: 11px; cursor: pointer;
      }
      .copy-btn:hover { background: rgba(255,255,255,0.08); }

      .section-label {
        margin: 0 0 6px; font-size: 10px; letter-spacing: 0.05em;
        text-transform: uppercase; color: var(--rip-muted);
      }
      .compare-wrap { margin: 0; }
      .compare {
        display: grid; gap: 4px; margin: 0;
        padding: 8px; border-radius: 8px;
        background: rgba(11, 13, 18, 0.7); border: 1px solid var(--rip-border);
      }
      .compare-head, .compare-row {
        display: grid; grid-template-columns: 68px 1fr 1fr; gap: 6px; align-items: start;
      }
      .compare-head { font-size: 10px; color: var(--rip-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .compare-label { font-size: 11px; color: var(--rip-muted); }
      .compare-expected, .compare-observed {
        font-size: 11px; color: var(--rip-soft); word-break: break-word; line-height: 1.35;
      }
      .tone-ok .compare-observed { color: var(--rip-success); }
      .tone-error .compare-observed { color: var(--rip-danger); font-weight: 700; }
      .tone-warn .compare-observed { color: var(--rip-warn); }

      .checks { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
      .checks li { font-size: 12px; margin: 0; color: var(--rip-soft); }
      .checks li.error { color: var(--rip-danger); }
      .checks li.warn { color: var(--rip-warn); }

      .scam-rules { display: grid; gap: 8px; margin: 0; }
      .scam-rule {
        padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--rip-border); background: rgba(11, 13, 18, 0.65);
      }
      .scam-rule.severity-block {
        background: var(--rip-danger-bg); border-color: rgba(248, 113, 113, 0.4);
      }
      .scam-rule.severity-warn {
        background: var(--rip-warn-bg); border-color: rgba(234, 179, 8, 0.35);
      }
      .scam-rule-title { margin: 0 0 3px; font-size: 12px; font-weight: 650; color: var(--rip-text); }
      .severity-block .scam-rule-title { color: var(--rip-danger); }
      .severity-warn .scam-rule-title { color: var(--rip-warn); }
      .scam-rule-body { margin: 0; font-size: 11px; color: var(--rip-soft); line-height: 1.4; }

      .pre-send {
        margin: 0; padding: 8px 10px; border-radius: 8px;
        background: var(--rip-info-bg); border: 1px solid rgba(125, 211, 252, 0.28);
      }
      .pre-send-title { margin: 0 0 3px; font-size: 12px; font-weight: 650; color: #d7e4ff; }
      .pre-send-body { margin: 0; font-size: 11px; color: var(--rip-muted); line-height: 1.4; }

      .primary-hint {
        margin: 0; padding: 10px 12px; border-radius: 8px;
        font-size: 13px; font-weight: 650; text-align: center; line-height: 1.35;
      }
      .primary-hint.accept {
        background: var(--rip-success-bg); border: 1px solid rgba(34, 197, 94, 0.35); color: var(--rip-success);
      }
      .primary-hint.wait {
        background: var(--rip-info-bg); border: 1px solid rgba(125, 211, 252, 0.28); color: #d7e4ff;
      }
      .primary-hint.block {
        background: var(--rip-danger-bg); border: 1px solid rgba(248, 113, 113, 0.4); color: var(--rip-danger);
      }

      .actions { display: grid; gap: 8px; margin: 0; }
      button, a.btn {
        display: block; text-align: center; text-decoration: none; border: none;
        border-radius: 9px; padding: 10px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
      }
      .primary {
        background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
        color: #fff;
      }
      .primary.accept-cta { background: #15803d; }
      .primary.accept-cta:hover { background: #16a34a; }
      .secondary {
        background: rgba(255,255,255,0.04); color: var(--rip-text);
        border: 1px solid var(--rip-border);
      }
      .linkish {
        display: block; text-align: center; font-size: 12px; color: var(--rip-link);
        text-decoration: none; padding: 2px 0;
      }
      .linkish:hover { text-decoration: underline; }
      .danger { background: #b91c1c; color: #fff; }
      .primary:disabled, .secondary:disabled { opacity: .55; cursor: not-allowed; }

      details.more, details.ack {
        margin: 0; border-top: 1px solid var(--rip-border); padding-top: 8px;
      }
      details.partner-more { border-top: none; padding-top: 0; }
      details.more summary, details.ack summary {
        cursor: pointer; font-size: 12px; color: var(--rip-muted); user-select: none;
        list-style: none;
      }
      details.more summary::-webkit-details-marker,
      details.ack summary::-webkit-details-marker { display: none; }
      details.more summary::before,
      details.ack summary::before {
        content: "▸"; display: inline-block; margin-right: 6px; color: var(--rip-muted);
      }
      details.more[open] summary::before,
      details.ack[open] summary::before { content: "▾"; }
      .more-body, .ack-body { display: grid; gap: 8px; margin-top: 8px; }
      .ack-note { margin: 0; font-size: 11px; color: var(--rip-muted); }

      .never-auto {
        margin: 0; font-size: 10px; color: var(--rip-muted); text-align: center; line-height: 1.35;
      }
      .deal-confirm {
        margin: 0; padding: 8px 10px; border-radius: 8px;
        background: rgba(15, 23, 42, 0.55); border: 1px solid var(--rip-border);
      }
      .deal-confirm.tone-ok {
        background: var(--rip-success-bg); border-color: rgba(34, 197, 94, 0.28);
      }
      .deal-confirm.tone-warn {
        background: var(--rip-warn-bg); border-color: rgba(234, 179, 8, 0.28);
      }
      .deal-confirm.tone-info {
        background: var(--rip-info-bg); border-color: rgba(56, 189, 248, 0.22);
      }
      .deal-confirm-title {
        margin: 0 0 2px; font-size: 13px; font-weight: 650; line-height: 1.3; color: var(--rip-text);
      }
      .deal-confirm.tone-ok .deal-confirm-title { color: var(--rip-success); }
      .deal-confirm.tone-warn .deal-confirm-title { color: var(--rip-warn); }
      .deal-confirm-body {
        margin: 0; font-size: 11px; color: var(--rip-soft); line-height: 1.35;
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
      <div class="brand">
        <p class="brand-mark">R.I.P Market</p>
        <p class="brand-chip">Steam</p>
      </div>
      <div class="gate-banner error">
        <p class="gate-title">Не наша сделка</p>
        <p class="gate-sub">Offer ${escapeHtml(offerLabel)} не привязан к активному заказу. Не принимайте.</p>
      </div>
      ${renderAntiScamWarnings(warnings, { compact: false })}
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
  const sellerGate =
    isPreSendPage && rawTrade.role === 'seller'
      ? resolveSellerTradeOfferGate({
          expectedAssetId: rawTrade.item.assetExternalId,
        })
      : null;
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
  const steamId = shield.partner.steamId;
  const onOfferPage = Boolean(parseOfferIdFromPath(window.location.pathname));
  const warnings = collectAntiScamWarnings(context);
  const scamBlocks = antiScamHasBlocking(warnings);
  let headline =
    sellerGate && status !== 'mismatch' && !scamBlocks
      ? {
          need_cs2: {
            title: t('offerGate.needCs2Title'),
            subtitle: t('offerGate.needCs2Body'),
            tone: 'warn' as const,
          },
          need_item: {
            title: t('offerGate.needItemTitle'),
            subtitle: t('offerGate.needItemBody', {
              name: trade.item.marketHashName,
            }),
            tone: 'warn' as const,
          },
          item_ready: {
            title: t('offerGate.itemReadyTitle'),
            subtitle: t('offerGate.itemReadyBody'),
            tone: 'ok' as const,
          },
        }[sellerGate]
      : shield.headline;

  const steamPage = detectSteamOfferPageLifecycle(document);
  const steamPostAccept = isPostAcceptSteamLifecycle(steamPage.lifecycle);
  if (steamPostAccept) {
    maybeReportSteamOfferPage(trade);
    if (status !== 'mismatch' && !scamBlocks) {
      headline = {
        title:
          steamPage.lifecycle === 'accepted'
            ? 'Обмен в Steam принят'
            : 'Обмен в Steam уже закрыт',
        subtitle:
          trade.role === 'buyer'
            ? 'Подтвердите «Предмет у меня» здесь — площадка закроет сделку. Accept больше не нужен.'
            : 'Покупатель принял обмен. Статус на площадке обновится после сверки доставки.',
        tone: 'ok',
      };
    }
  }

  const acceptAllowed =
    !steamPostAccept &&
    canShowManualAcceptAssist({
      ...trade,
      verificationStatus: status,
    }) &&
    shield.partner.match === 'match' &&
    !scamBlocks;

  const acceptAssistDone =
    steamPostAccept ||
    (acceptAssistUi?.offerId === trade.offerId &&
      acceptAssistUi.phase === 'done');
  const confirmPhase = resolveDealConfirmPhase(trade, {
    acceptAssistDone,
  });
  const confirmBanner = buildDealConfirmBanner(trade, overlayLocale, {
    acceptAssistDone,
  });

  const showConfirmReceived =
    needsBuyerReceivedConfirm(trade, { acceptAssistDone }) &&
    status !== 'mismatch' &&
    !scamBlocks;

  // After Accept (or once delivery phase starts) confirm in-extension — not on site.
  const showPrimaryReceived =
    showConfirmReceived &&
    !(
      acceptAllowed &&
      acceptAssistUi?.phase !== 'done' &&
      trade.orderStatus === 'WAITING_TRADE'
    );

  if (
    trade.role === 'buyer' &&
    !showConfirmReceived &&
    isDeliveryDualSignalOk(trade.deliveryProgress) &&
    !trade.acknowledgments.buyerReceived
  ) {
    bumpMetricOnce(
      `skip-dual:${trade.orderId}`,
      'received_ack_skipped_dual_signal',
    );
  }
  if (showPrimaryReceived) {
    bumpMetricOnce(`shown:${trade.orderId}`, 'received_ack_shown');
  }
  bumpMetricOnce(
    `panel:${trade.orderId}:${trade.offerId ?? 'none'}`,
    'steam_panel_views',
  );

  const buyerCtaOverride =
    trade.role === 'buyer' && onOfferPage && scamBlocks && status !== 'mismatch'
      ? `<p class="primary-hint block">Сначала устраните anti-scam предупреждения — Accept пока не нажимайте</p>`
      : showPrimaryReceived
        ? `<button type="button" class="btn primary accept-cta" data-action="confirm-received">${escapeHtml(t('cta.confirmReceived'))}</button>`
        : primaryCtaHtml(trade, shield, sellerGate);

  const dealConfirmHtml =
    confirmBanner &&
    trade.role === 'buyer' &&
    !scamBlocks &&
    status !== 'mismatch' &&
    !showPrimaryReceived &&
    !(acceptAllowed && !acceptAssistDone)
      ? dealConfirmBannerHtml(confirmBanner, escapeHtml)
      : '';

  const preSendBanner =
    shield.isPreSend && !sellerGate
      ? `<div class="pre-send">
        <p class="pre-send-title">${escapeHtml(t('shield.preSendTitle'))}</p>
        <p class="pre-send-body">${escapeHtml(t('shield.preSendBody'))}</p>
      </div>`
      : '';

  const showOrderLink =
    status !== 'mismatch' &&
    shield.partner.match !== 'mismatch' &&
    (trade.role === 'seller' ||
      confirmPhase === 'verifying' ||
      confirmPhase === 'done' ||
      trade.orderStatus === 'DISPUTE');
  const partnerToolsOpen =
    status === 'mismatch' || shield.partner.match === 'mismatch';
  const compareForceOpen =
    status === 'mismatch' || status === 'partial' || scamBlocks;
  const quietAntiScam =
    status !== 'mismatch' && !scamBlocks && shield.partner.match !== 'mismatch';

  const moneyLine =
    trade.escrow.status === 'active'
      ? `<p class="money"><strong>Hold ${formatMoneyMinor(trade.escrow.holdAmountMinor)}</strong> · не платите в чат Steam</p>`
      : `<p class="money"><strong>Оплата на площадке</strong> · не переводите деньги в чат Steam</p>`;

  shadow.innerHTML = `
    <style>${PANEL_STYLES}</style>
    <div class="panel ${statusClass(status)}${scamBlocks ? ' rip-scam-block' : ''}">
      <div class="brand">
        <p class="brand-mark">R.I.P Market</p>
        <p class="brand-chip">${trade.role === 'seller' ? 'Продажа' : 'Покупка'}</p>
      </div>
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
      ${dealConfirmHtml}
      ${preSendBanner}
      ${renderItemHero(shield)}
      ${renderPartnerBlock(shield, { expandTools: partnerToolsOpen })}
      ${moneyLine}
      <div class="actions">
        ${buyerCtaOverride}
        ${
          showOrderLink
            ? `<a class="linkish" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer" data-action="open-order">${escapeHtml(t('cta.openOrder'))}</a>`
            : ''
        }
      </div>
      ${renderAntiScamWarnings(warnings, { compact: quietAntiScam })}
      ${
        onOfferPage || isPreSendPage
          ? renderCompareSection(shield, { forceOpen: compareForceOpen })
          : ''
      }
      ${renderFailedChecks(trade)}
      <p class="never-auto">${
        trade.role === 'buyer' && onOfferPage && acceptAllowed && !showPrimaryReceived
          ? 'Accept в Steam — только после вашего двойного подтверждения.'
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
    .querySelector<HTMLAnchorElement>('a[data-action="open-order"]')
    ?.addEventListener('click', () => {
      void bumpDealFlowMetric('order_link_clicks');
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
  void bumpDealFlowMetric('received_ack_clicked');
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
let offerPanelContextInvalidated = false;
let offerPanelObserver: MutationObserver | null = null;

async function refreshPanel(): Promise<void> {
  if (refreshInFlight || offerPanelContextInvalidated) {
    return;
  }
  if (!isExtensionContextValid()) {
    offerPanelContextInvalidated = true;
    offerPanelObserver?.disconnect();
    document.getElementById(PANEL_ID)?.remove();
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
  } catch (error) {
    if (
      isExtensionContextInvalidatedError(error) ||
      !isExtensionContextValid()
    ) {
      offerPanelContextInvalidated = true;
      offerPanelObserver?.disconnect();
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    throw error;
  } finally {
    refreshInFlight = false;
  }
}

function watchTradeOfferDom(): void {
  const root =
    document.querySelector('#trade_slots') ??
    document.querySelector('.tradeoffer') ??
    document.body;
  offerPanelObserver?.disconnect();
  offerPanelObserver = new MutationObserver(() => {
    void refreshPanel();
  });
  offerPanelObserver.observe(root, { childList: true, subtree: true });
}

async function mountPanel(): Promise<void> {
  // List page is handled by trade-offers-list-bridge (B1 + B3 sticky).
  if (/\/tradeoffers\/?/i.test(window.location.pathname)) {
    return;
  }
  try {
    await ensureOverlayLocale();
    await refreshGuidedBuyerFlag();
    const context = await loadTradeForPage();
    if (!context) {
      return;
    }
    ensureStickyHint();
    replacePanel(context);
    watchTradeOfferDom();
  } catch (error) {
    if (
      isExtensionContextInvalidatedError(error) ||
      !isExtensionContextValid()
    ) {
      offerPanelContextInvalidated = true;
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    console.warn('[rip-market] trade verification panel failed', error);
  }
}

void mountPanel();
