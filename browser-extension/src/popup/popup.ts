import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  clearSteamWebApiKey,
  getSteamWebApiKey,
  saveSteamWebApiKey,
} from '../shared/steam-web-api-settings.js';
import {
  buildPrivacyTransparency,
  permissionRationaleLines,
  privacyTransparencyHtml,
} from '../shared/extension-privacy.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';
import type { SessionHealth } from '../shared/session-health.js';
import type { BuyerInboxCard } from '../shared/buyer-inbox.js';
import {
  buildHomeDashboard,
  type ActionRequiredItem,
  type ConnectionDashboard,
  type HomeDashboard,
} from '../shared/popup-home-dashboard.js';
import {
  resolveTradeNextAction,
  type NextActionCta,
  type ResolvedNextAction,
} from '../shared/popup-next-action.js';
import type { OpsHealthView } from '../shared/extension-ops-health.js';
import {
  buildSettlementTransparency,
  settlementTransparencyHtml,
} from '../shared/settlement-transparency.js';
import { isExtensionQuietNotificationsEnabled } from '../shared/extension-flags.js';
import {
  buildDisputeStatusView,
  disputeStatusHtml,
} from '../shared/in-flow-dispute.js';
import {
  postTradeReceiptHtml,
  type PostTradeReceiptView,
} from '../shared/post-trade-receipt.js';
import {
  createExtensionT,
  getStoredExtensionLocale,
  setStoredExtensionLocale,
  type ExtensionLocale,
} from '../shared/extension-i18n.js';
import {
  applySafeModeToNextAction,
  buildSafeModeBanner,
  defaultSiteLinkSnapshot,
  safeModeBannerHtml,
  type SiteLinkSnapshot,
} from '../shared/offline-safe-mode.js';
import {
  CS2_INVENTORY_URL,
  getTwoMinuteOnboardingState,
  persistDismissTwoMinuteWizard,
  resolveTwoMinuteOnboardingView,
  setTwoMinuteOnboardingState,
  twoMinuteOnboardingHtml,
  withAutoComplete,
} from '../shared/two-minute-onboarding.js';

const connectionEl = document.getElementById('connection');
const opsHealthEl = document.getElementById('ops-health');
const emptyHomeEl = document.getElementById('empty-home');
const actionRequiredEl = document.getElementById('action-required');
const buyerInboxEl = document.getElementById('buyer-inbox');
const sellerTradesEl = document.getElementById('seller-trades');
const recentReceiptsEl = document.getElementById('recent-receipts');
const popupLeadEl = document.querySelector('.lead');
const popupHintEl = document.querySelector('.hint');
const languageSelectEl = document.getElementById(
  'extension-locale',
) as HTMLSelectElement | null;

let activeLocale: ExtensionLocale = 'ru';
let t = createExtensionT(activeLocale);
let activeSiteLink: SiteLinkSnapshot = defaultSiteLinkSnapshot();
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;
const openSiteBtn = document.getElementById('open-site') as HTMLButtonElement;
const refreshHealthBtn = document.getElementById('refresh-health') as HTMLButtonElement;
const copyDebugBtn = document.getElementById('copy-debug') as HTMLButtonElement;
const refreshTradesBtn = document.getElementById('refresh-trades') as HTMLButtonElement;
const apiKeyInput = document.getElementById('steam-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key') as HTMLButtonElement;
const clearApiKeyBtn = document.getElementById('clear-api-key') as HTMLButtonElement;
const apiKeyStatusEl = document.getElementById('api-key-status');
const privacyEl = document.getElementById('privacy-transparency');
const permissionsListEl = document.getElementById('permissions-rationale');
const safeModeBannerEl = document.getElementById('safe-mode-banner');
const twoMinEl = document.getElementById('two-minute-onboarding');
const quietNotifyEnabledEl = document.getElementById(
  'quiet-notify-enabled',
) as HTMLInputElement | null;
const quietNotifyMutedEl = document.getElementById('quiet-notify-muted');

type ExtensionStatus = {
  connected: boolean;
  expiresAt?: string;
  apiBaseUrl?: string;
};

function withSafeModeCta(
  cta: ResolvedNextAction,
): ResolvedNextAction {
  return applySafeModeToNextAction(cta, activeSiteLink.safeMode, activeLocale);
}

function escapeHtml(value: string): string {

  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatMoneyMinor(amountMinor: string): string {
  const value = Number(amountMinor) / 100;
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : amountMinor;
}

function roleLabel(role: TradeVerificationResult['role']): string {
  return role === 'buyer' ? t('common.buyer') : t('common.seller');
}

function renderCtaControl(cta: NextActionCta, variant: 'primary' | 'secondary'): string {
  const cls = variant === 'primary' ? 'btn primary' : 'btn secondary';
  if (cta.mode === 'link' && cta.href) {
    return `<a class="${cls}" href="${escapeHtml(cta.href)}" target="_blank" rel="noreferrer" data-cta-id="${escapeHtml(cta.id)}">${escapeHtml(cta.label)}</a>`;
  }
  if (cta.mode === 'button' && cta.ackType && cta.orderId) {
    return `<button class="${variant === 'primary' ? 'primary' : 'secondary'}" type="button" data-ack="${cta.ackType}" data-order="${escapeHtml(cta.orderId)}" data-offer="${escapeHtml(cta.offerId ?? '')}" data-cta-id="${escapeHtml(cta.id)}">${escapeHtml(cta.label)}</button>`;
  }
  if (cta.mode === 'runtime' && cta.runtime === 'poll_now') {
    return `<button class="${variant === 'primary' ? 'primary' : 'secondary'}" type="button" data-runtime="poll_now" data-cta-id="${escapeHtml(cta.id)}">${escapeHtml(cta.label)}</button>`;
  }
  return '';
}

/** E2: one primary CTA; extras only under More. */
function renderNextActionBlock(resolved: ResolvedNextAction): string {
  const primary = renderCtaControl(resolved.primary, 'primary');
  const hint = resolved.hint
    ? `<p class="cta-hint">${escapeHtml(resolved.hint)}</p>`
    : '';
  const overflowItems = resolved.overflow
    .map((item) => renderCtaControl(item, 'secondary'))
    .filter(Boolean);
  const overflow =
    overflowItems.length > 0
      ? `<details class="card-more"><summary>${escapeHtml(t('common.more'))}</summary>${overflowItems.join('')}</details>`
      : '';
  return `${hint}${primary}${overflow}`;
}

function bindCardActions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('button[data-ack]').forEach((button) => {
    button.addEventListener('click', () => {
      void acknowledgeFromPopup(button);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('button[data-runtime="poll_now"]').forEach((button) => {
    button.addEventListener('click', () => {
      void retrySendFromPopup(button);
    });
  });
}

function renderConnection(connection: ConnectionDashboard): void {
  if (!connectionEl) {
    return;
  }
  connectionEl.className = `connection ${connection.tone}`;
  connectionEl.innerHTML = `
    <p class="connection-title">${escapeHtml(connection.title)}</p>
    <p class="connection-detail">${escapeHtml(connection.detail)}</p>
    <p class="connection-steam">${escapeHtml(connection.steamLabel)}</p>
  `;
}

function renderOpsHealth(view: OpsHealthView | null): void {
  if (!opsHealthEl) {
    return;
  }
  if (!view) {
    opsHealthEl.hidden = true;
    opsHealthEl.innerHTML = '';
    return;
  }
  opsHealthEl.hidden = false;
  opsHealthEl.innerHTML = `
    <div class="ops-health-row">
      <span class="ops-health-label">Опрос</span>
      <span class="ops-health-value ${view.pollTone}">${escapeHtml(view.pollLine)}</span>
    </div>
    <div class="ops-health-row">
      <span class="ops-health-label">Steam</span>
      <span class="ops-health-value ${view.rateLimitTone}">${escapeHtml(view.rateLimitLine)}</span>
    </div>
    <div class="ops-health-row">
      <span class="ops-health-label">Сборка</span>
      <span class="ops-health-value muted">${escapeHtml(view.versionLine)}</span>
      <a class="btn secondary ops-health-update" href="${escapeHtml(view.updateUrl)}" target="_blank" rel="noreferrer">${escapeHtml(view.updateLabel)}</a>
    </div>
  `;
}

function renderEmptyHome(home: HomeDashboard): void {
  if (!emptyHomeEl) {
    return;
  }
  if (!home.emptyHome) {
    emptyHomeEl.hidden = true;
    emptyHomeEl.innerHTML = '';
    return;
  }
  emptyHomeEl.hidden = false;
  emptyHomeEl.innerHTML = `
    <p><strong>${escapeHtml(t('popup.emptyTitle'))}.</strong><br />${escapeHtml(t('popup.emptyBody'))}</p>
  `;
}

function renderActionRequired(items: ActionRequiredItem[]): void {
  if (!actionRequiredEl) {
    return;
  }
  if (items.length === 0) {
    actionRequiredEl.hidden = true;
    actionRequiredEl.innerHTML = '';
    return;
  }

  actionRequiredEl.hidden = false;
  actionRequiredEl.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(t('popup.actionTitle'))}</h2>
      <p class="section-sub">${escapeHtml(t('popup.actionSub'))}</p>
      <span class="section-count">${items.length}</span>
    </div>
    <div class="action-list">
      ${items.map((item) => renderActionCard(item)).join('')}
    </div>
  `;

  bindCardActions(actionRequiredEl);
}

function renderActionCard(item: ActionRequiredItem): string {
  const metaParts = [
    item.roleLabel,
    item.orderShortId ? `#${item.orderShortId}` : null,
    item.amountMinor ? formatMoneyMinor(item.amountMinor) : null,
  ].filter(Boolean);
  const cta = withSafeModeCta(item.cta);

  return `
    <article class="action-card tone-${item.tone}" data-action-kind="${escapeHtml(item.kind)}" data-primary-cta="${escapeHtml(cta.primary.id)}">
      <div class="phase-row">
        <span class="phase-badge">${escapeHtml(item.badge)}</span>
      </div>
      ${item.itemName ? `<h2>${escapeHtml(item.itemName)}</h2>` : `<h2>${escapeHtml(item.title)}</h2>`}
      ${
        metaParts.length > 0
          ? `<p class="meta">${escapeHtml(metaParts.join(' · '))}</p>`
          : ''
      }
      <p class="next"><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.description)}</p>
      ${renderNextActionBlock(cta)}
    </article>
  `;
}

function renderBuyerInbox(cards: BuyerInboxCard[]): void {
  if (!buyerInboxEl) {
    return;
  }

  if (cards.length === 0) {
    buyerInboxEl.hidden = true;
    buyerInboxEl.innerHTML = '';
    return;
  }

  buyerInboxEl.hidden = false;
  buyerInboxEl.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(t('popup.buyersTitle'))}</h2>
      <p class="section-sub">${escapeHtml(t('popup.buyersSub'))}</p>
      <span class="section-count">${cards.length}</span>
    </div>
    <div class="trades buyer-inbox-list">
      ${cards.map((card) => renderBuyerCard(card)).join('')}
    </div>
  `;

  bindCardActions(buyerInboxEl);
}

function renderBuyerCard(card: BuyerInboxCard): string {
  const settlement =
    card.settlement != null
      ? settlementTransparencyHtml(card.settlement, escapeHtml)
      : '';
  const dispute =
    card.dispute != null ? disputeStatusHtml(card.dispute, escapeHtml) : '';
  const cta = withSafeModeCta(card.cta);
  return `
    <article class="trade-card phase-${card.phase} tone-${card.tone}" data-buyer-phase="${card.phase}" data-primary-cta="${escapeHtml(cta.primary.id)}">
      <div class="phase-row">
        <span class="phase-badge">${escapeHtml(card.phaseLabel)}</span>
      </div>
      <h2>${escapeHtml(card.itemName)}</h2>
      <p class="meta">#${escapeHtml(card.orderShortId)} · ${escapeHtml(formatMoneyMinor(card.amountMinor))}</p>
      <p class="next"><strong>${escapeHtml(card.title)}</strong><br />${escapeHtml(card.description)}</p>
      ${
        card.timeoutLabel
          ? `<p class="timeout-hint">${escapeHtml(card.timeoutLabel)}</p>`
          : ''
      }
      ${dispute}
      ${settlement}
      ${renderNextActionBlock(cta)}
    </article>
  `;
}

function renderSellerTrades(trades: TradeVerificationResult[]): void {
  if (!sellerTradesEl) {
    return;
  }
  if (trades.length === 0) {
    sellerTradesEl.hidden = true;
    sellerTradesEl.innerHTML = '';
    return;
  }

  sellerTradesEl.hidden = false;
  sellerTradesEl.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(t('popup.sellersTitle'))}</h2>
      <p class="section-sub">${escapeHtml(t('popup.sellersSub'))}</p>
      <span class="section-count">${trades.length}</span>
    </div>
    <div class="trades seller-trades-list">
      ${trades.map((trade) => renderSellerCard(trade)).join('')}
    </div>
  `;

  bindCardActions(sellerTradesEl);
}

function renderSellerCard(trade: TradeVerificationResult): string {
  const cta = withSafeModeCta(resolveTradeNextAction(trade, activeLocale));
  const statusClass =
    trade.verificationStatus === 'verified'
      ? 'verified'
      : trade.nextAction.kind === 'platform_verifying'
        ? 'verifying'
        : '';
  const settlementView = buildSettlementTransparency(trade, {
    locale: activeLocale,
  });
  const settlement =
    settlementView != null
      ? settlementTransparencyHtml(settlementView, escapeHtml)
      : '';
  const disputeView = buildDisputeStatusView(trade, activeLocale);
  const dispute =
    disputeView != null ? disputeStatusHtml(disputeView, escapeHtml) : '';

  return `
    <article class="trade-card ${statusClass}" data-primary-cta="${escapeHtml(cta.primary.id)}">
      <h2>${escapeHtml(trade.item.marketHashName)}</h2>
      <p class="meta">#${escapeHtml(trade.orderShortId)} · ${escapeHtml(roleLabel(trade.role))} · ${escapeHtml(formatMoneyMinor(trade.amountMinor))}</p>
      <p class="next"><strong>${escapeHtml(trade.nextAction.title)}</strong><br />${escapeHtml(trade.nextAction.description)}</p>
      ${dispute}
      ${settlement}
      ${renderNextActionBlock(cta)}
    </article>
  `;
}

function renderRecentReceipts(receipts: PostTradeReceiptView[]): void {
  if (!recentReceiptsEl) {
    return;
  }
  if (receipts.length === 0) {
    recentReceiptsEl.hidden = true;
    recentReceiptsEl.innerHTML = '';
    return;
  }

  recentReceiptsEl.hidden = false;
  recentReceiptsEl.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(t('popup.receiptsTitle'))}</h2>
      <p class="section-sub">${escapeHtml(t('popup.receiptsSub'))}</p>
      <span class="section-count">${receipts.length}</span>
    </div>
    <div class="receipts-list">
      ${receipts
        .map((view) => postTradeReceiptHtml(view, escapeHtml, formatMoneyMinor))
        .join('')}
    </div>
  `;
}

function renderHome(home: HomeDashboard): void {
  renderConnection(home.connection);
  renderEmptyHome(home);
  renderActionRequired(home.actionItems);
  renderBuyerInbox(home.buyers);
  renderSellerTrades(home.sellers);
  renderRecentReceipts(home.receipts);
}

async function acknowledgeFromPopup(button: HTMLButtonElement): Promise<void> {
  const orderId = button.dataset.order;
  const ackType = button.dataset.ack as
    | 'SELLER_ACK_SENT'
    | 'BUYER_ACK_PRE_ACCEPT'
    | 'BUYER_ACK_RECEIVED'
    | undefined;
  if (!orderId || !ackType) {
    return;
  }
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'Сохраняем…';
  const response = await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.ACK_TRADE,
    orderId,
    ackType,
    offerId: button.dataset.offer || undefined,
    idempotencyKey: `ack:${orderId}:${ackType}`,
  });
  if (response?.ok) {
    button.textContent = 'Готово ✓';
    await render();
  } else {
    button.textContent = previous ?? 'Повторить';
    button.disabled = false;
  }
}

async function retrySendFromPopup(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'Повторяем…';
  try {
    await chrome.runtime.sendMessage({ type: 'RIP_MARKET_POLL_NOW' });
    button.textContent = 'Запущено ✓';
    await render();
  } catch {
    button.textContent = previous ?? 'Повторить отправку';
    button.disabled = false;
    return;
  }
  window.setTimeout(() => {
    if (button.isConnected) {
      button.textContent = previous ?? 'Повторить отправку';
      button.disabled = false;
    }
  }, 1500);
}

async function fetchStatus(): Promise<ExtensionStatus> {
  return chrome.runtime.sendMessage({ type: 'RIP_MARKET_STATUS' }) as Promise<ExtensionStatus>;
}

async function fetchHealth(): Promise<SessionHealth | null> {
  const response = (await chrome.runtime.sendMessage({
    type: 'RIP_MARKET_SESSION_HEALTH',
    probeInventory: true,
  })) as { ok: boolean; health?: SessionHealth };
  return response.ok ? (response.health ?? null) : null;
}

async function loadTrades(): Promise<TradeVerificationResult[]> {
  const refreshed = (await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.REFRESH_ACTIVE_TRADES,
  })) as {
    ok: boolean;
    trades?: TradeVerificationResult[];
    siteLink?: SiteLinkSnapshot;
  };

  if (refreshed.siteLink) {
    activeSiteLink = refreshed.siteLink;
  }

  if (refreshed.ok && refreshed.trades) {
    return refreshed.trades;
  }

  const cached = (await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
  })) as {
    ok: boolean;
    trades?: TradeVerificationResult[];
    siteLink?: SiteLinkSnapshot;
  };

  if (cached.siteLink) {
    activeSiteLink = cached.siteLink;
  }

  return cached.trades ?? [];
}

async function renderTwoMinuteOnboarding(connected: boolean): Promise<void> {
  if (!twoMinEl) {
    return;
  }
  const stored = await getTwoMinuteOnboardingState();
  const state = withAutoComplete(stored, connected);
  if (state.completedAt && !stored.completedAt) {
    await setTwoMinuteOnboardingState(state);
  }
  const view = resolveTwoMinuteOnboardingView({
    connected,
    state,
    locale: activeLocale,
  });
  if (!view.visible) {
    twoMinEl.hidden = true;
    twoMinEl.innerHTML = '';
    return;
  }
  twoMinEl.hidden = false;
  twoMinEl.innerHTML = twoMinuteOnboardingHtml(view, escapeHtml);
  twoMinEl
    .querySelectorAll<HTMLButtonElement>('[data-two-min-primary]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void handleTwoMinutePrimary(button.dataset.twoMinPrimary ?? '');
      });
    });
  twoMinEl
    .querySelector<HTMLButtonElement>('[data-two-min-dismiss]')
    ?.addEventListener('click', () => {
      void persistDismissTwoMinuteWizard().then(() => render());
    });
}

async function handleTwoMinutePrimary(kind: string): Promise<void> {
  if (kind === 'dismiss') {
    await persistDismissTwoMinuteWizard();
    await render();
    return;
  }
  if (kind === 'open_inventory') {
    void chrome.tabs.create({ url: CS2_INVENTORY_URL });
    return;
  }
  if (kind === 'open_account') {
    const status = await fetchStatus();
    const safeUrl = status.apiBaseUrl
      ? `${status.apiBaseUrl.replace(/\/api\/v1\/?$/, '')}/account`
      : 'http://localhost:5173/account';
    void chrome.tabs.create({ url: safeUrl });
  }
}

function renderSafeModeBanner(): void {

  if (!safeModeBannerEl) {
    return;
  }
  const view = buildSafeModeBanner(activeSiteLink, activeLocale);
  if (!view) {
    safeModeBannerEl.hidden = true;
    safeModeBannerEl.innerHTML = '';
    safeModeBannerEl.className = 'safe-mode';
    return;
  }
  safeModeBannerEl.hidden = false;
  safeModeBannerEl.className = `safe-mode tone-${view.tone}`;
  safeModeBannerEl.innerHTML = safeModeBannerHtml(view);
}

async function renderQuietNotifySettings(): Promise<void> {
  const field = document.getElementById('quiet-notify-field');
  const remoteAllowed = await isExtensionQuietNotificationsEnabled();
  if (field) {
    field.hidden = !remoteAllowed;
  }
  if (!remoteAllowed || !quietNotifyEnabledEl) {
    return;
  }
  const response = (await chrome.runtime.sendMessage({
    type: 'RIP_MARKET_QUIET_NOTIFY_GET',
  })) as {
    ok?: boolean;
    state?: { enabled: boolean; mutedOrderIds: string[] };
  };
  if (!response?.ok || !response.state) {
    return;
  }
  if (document.activeElement !== quietNotifyEnabledEl) {
    quietNotifyEnabledEl.checked = response.state.enabled;
  }
  if (!quietNotifyMutedEl) {
    return;
  }
  const muted = response.state.mutedOrderIds ?? [];
  if (muted.length === 0) {
    quietNotifyMutedEl.innerHTML = '';
    return;
  }
  quietNotifyMutedEl.innerHTML = `
    <div class="muted-list">
      ${muted
        .map(
          (orderId) => `<div class="muted-row">
            <span>Скрыта · ${escapeHtml(orderId.slice(0, 8))}…</span>
            <button type="button" class="secondary" data-unmute="${escapeHtml(orderId)}">Вернуть</button>
          </div>`,
        )
        .join('')}
    </div>
  `;
  quietNotifyMutedEl
    .querySelectorAll<HTMLButtonElement>('button[data-unmute]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void chrome.runtime
          .sendMessage({
            type: 'RIP_MARKET_QUIET_NOTIFY_UNMUTE',
            orderId: button.dataset.unmute,
          })
          .then(() => renderQuietNotifySettings());
      });
    });
}

async function renderApiKeyStatus(): Promise<void> {
  if (!apiKeyStatusEl) {
    return;
  }
  const stored = await getSteamWebApiKey();
  apiKeyStatusEl.textContent = stored
    ? t('popup.apiKeyStatusSaved')
    : t('popup.apiKeyStatusEmpty');
}

function renderPrivacyTransparency(): void {
  if (!privacyEl) {
    return;
  }
  privacyEl.innerHTML = privacyTransparencyHtml(
    buildPrivacyTransparency(activeLocale),
  );
}

function renderPermissionsRationale(): void {
  if (!permissionsListEl) {
    return;
  }
  const lines = permissionRationaleLines(activeLocale, true);
  permissionsListEl.innerHTML = lines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');
}

async function fetchOpsHealth(health: SessionHealth | null): Promise<OpsHealthView | null> {
  const response = (await chrome.runtime.sendMessage({
    type: 'RIP_MARKET_OPS_HEALTH',
    health,
    probeInventory: false,
  })) as { ok?: boolean; view?: OpsHealthView };
  return response?.ok && response.view ? response.view : null;
}

async function applyChromeLocale(): Promise<void> {
  activeLocale = await getStoredExtensionLocale();
  t = createExtensionT(activeLocale);
  document.documentElement.lang = activeLocale;

  if (popupLeadEl) {
    popupLeadEl.textContent = t('popup.lead');
  }
  if (popupHintEl) {
    popupHintEl.textContent = t('popup.pairHint');
  }
  if (openSiteBtn) {
    openSiteBtn.textContent = t('popup.openSite');
  }
  if (refreshHealthBtn) {
    refreshHealthBtn.textContent = t('popup.refreshHealth');
  }
  if (refreshTradesBtn) {
    refreshTradesBtn.textContent = t('popup.refreshTrades');
  }
  if (copyDebugBtn) {
    copyDebugBtn.textContent = t('popup.copyDebug');
  }
  if (disconnectBtn) {
    disconnectBtn.textContent = t('popup.disconnect');
  }

  const advancedSummary = document.querySelector('#advanced-settings > summary');
  if (advancedSummary) {
    advancedSummary.textContent = t('popup.advanced');
  }
  const quietLabel = document.querySelector('label[for="quiet-notify-enabled"]');
  if (quietLabel) {
    const input = quietLabel.querySelector('input');
    quietLabel.textContent = '';
    if (input) {
      quietLabel.appendChild(input);
      quietLabel.append(` ${t('popup.quietNotifyLabel')}`);
    } else {
      quietLabel.textContent = t('popup.quietNotifyLabel');
    }
  }
  const quietNote = document.getElementById('quiet-notify-note');
  if (quietNote) {
    quietNote.textContent = t('popup.quietNotifyNote');
  }
  const permissionsTitle = document.getElementById('permissions-title');
  if (permissionsTitle) {
    permissionsTitle.textContent = t('popup.permissionsTitle');
  }
  const supportSummary = document.getElementById('support-emergency-summary');
  if (supportSummary) {
    supportSummary.textContent = t('popup.supportEmergency');
  }
  const apiKeyNote = document.getElementById('api-key-note');
  if (apiKeyNote) {
    apiKeyNote.textContent = t('popup.apiKeyNote');
  }
  const apiKeyLabel = document.querySelector('label[for="steam-api-key"]');
  if (apiKeyLabel) {
    apiKeyLabel.textContent = t('popup.apiKeyLabel');
  }
  if (apiKeyInput) {
    apiKeyInput.placeholder = t('popup.apiKeyPlaceholder');
  }
  if (saveApiKeyBtn) {
    saveApiKeyBtn.textContent = t('popup.apiKeySave');
  }
  if (clearApiKeyBtn) {
    clearApiKeyBtn.textContent = t('popup.apiKeyClear');
  }
  if (languageSelectEl) {
    languageSelectEl.value = activeLocale;
  }
  const languageLabel = document.querySelector('label[for="extension-locale"]');
  if (languageLabel) {
    languageLabel.textContent = t('popup.languageLabel');
  }
  const languageHint = document.getElementById('extension-locale-hint');
  if (languageHint) {
    languageHint.textContent = t('popup.languageHint');
  }
  renderPrivacyTransparency();
  renderPermissionsRationale();
}

async function render(): Promise<void> {
  await applyChromeLocale();
  const status = await fetchStatus();
  const health = await fetchHealth();
  const trades = status.connected
    ? await loadTrades()
    : await (async () => {
        const cached = (await chrome.runtime.sendMessage({
          type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
        })) as {
          ok?: boolean;
          trades?: TradeVerificationResult[];
          siteLink?: SiteLinkSnapshot;
        };
        if (cached.siteLink) {
          activeSiteLink = cached.siteLink;
        } else {
          activeSiteLink = {
            ...defaultSiteLinkSnapshot(),
            fromCache: Boolean(cached.trades?.length),
            cacheUpdatedAt: null,
          };
        }
        return cached.trades ?? [];
      })();
  const opsView = await fetchOpsHealth(health);

  disconnectBtn.hidden = !status.connected;
  refreshTradesBtn.hidden = !status.connected;

  const home = buildHomeDashboard({
    connected: status.connected,
    expiresAt: status.expiresAt,
    health,
    trades,
    locale: activeLocale,
  });
  await renderTwoMinuteOnboarding(status.connected);
  renderSafeModeBanner();
  renderHome(home);
  renderOpsHealth(opsView);

  const storedKey = await getSteamWebApiKey();
  if (apiKeyInput && document.activeElement !== apiKeyInput) {
    apiKeyInput.value = storedKey ?? '';
  }
  await renderApiKeyStatus();
  await renderQuietNotifySettings();
}

openSiteBtn.addEventListener('click', () => {
  void fetchStatus().then((status) => {
    const safeUrl = status.apiBaseUrl
      ? `${status.apiBaseUrl.replace(/\/api\/v1\/?$/, '')}/account`
      : 'http://localhost:5173/account';
    void chrome.tabs.create({ url: safeUrl });
  });
});

languageSelectEl?.addEventListener('change', () => {
  const next = languageSelectEl.value === 'en' ? 'en' : 'ru';
  void setStoredExtensionLocale(next).then(() => render());
});

disconnectBtn.addEventListener('click', () => {
  void chrome.runtime
    .sendMessage({ type: 'RIP_MARKET_DISCONNECT' })
    .then(() => render());
});

refreshHealthBtn.addEventListener('click', () => {
  void render();
});

copyDebugBtn.addEventListener('click', () => {
  void (async () => {
    const previous = copyDebugBtn.textContent;
    copyDebugBtn.disabled = true;
    copyDebugBtn.textContent = t('popup.copyDebugBusy');
    const response = (await chrome.runtime.sendMessage({
      type: 'RIP_MARKET_DEBUG_PACK',
      probeInventory: true,
    })) as {
      ok?: boolean;
      pack?: Record<string, unknown>;
      clipboardText?: string;
      supportUrl?: string;
      error?: string;
    };
    if (response?.ok && (response.clipboardText || response.pack)) {
      const text =
        response.clipboardText ??
        JSON.stringify(response.pack, null, 2);
      await navigator.clipboard.writeText(text);
      if (response.supportUrl) {
        void chrome.tabs.create({ url: response.supportUrl });
        copyDebugBtn.textContent = t('popup.copyDebugOpened');
      } else {
        copyDebugBtn.textContent = t('popup.copyDebugDone');
      }
    } else {
      copyDebugBtn.textContent = previous ?? t('popup.copyDebug');
    }
    window.setTimeout(() => {
      copyDebugBtn.textContent = previous ?? t('popup.copyDebug');
      copyDebugBtn.disabled = false;
    }, 2000);
  })();
});

refreshTradesBtn.addEventListener('click', () => {
  void render();
});

saveApiKeyBtn.addEventListener('click', () => {
  void (async () => {
    const result = await saveSteamWebApiKey(apiKeyInput.value);
    if (!result.ok && result.reason === 'permission_denied' && apiKeyStatusEl) {
      apiKeyStatusEl.textContent = t('popup.apiKeyPermissionDenied');
      return;
    }
    await render();
  })();
});

clearApiKeyBtn.addEventListener('click', () => {
  apiKeyInput.value = '';
  void clearSteamWebApiKey().then(() => render());
});

quietNotifyEnabledEl?.addEventListener('change', () => {
  void chrome.runtime
    .sendMessage({
      type: 'RIP_MARKET_QUIET_NOTIFY_SET',
      enabled: Boolean(quietNotifyEnabledEl.checked),
    })
    .then(() => renderQuietNotifySettings());
});

void render();
