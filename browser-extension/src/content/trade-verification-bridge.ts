import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  TRADE_VERIFICATION_RUNTIME,
  type AckTradeRuntimeRequest,
} from '../shared/trade-verification-runtime.js';
import {
  detectTradePageRole,
  parseObservedItemFromTradePage,
} from '../shared/trade-offer-observed-item.js';

const PANEL_ID = 'rip-market-trade-verification-panel';
const STEAM_INCOMING_OFFERS_URL = 'https://steamcommunity.com/my/tradeoffers/';
const STEAM_ITEM_IMAGE_CDN =
  'https://community.cloudflare.steamstatic.com/economy/image';

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

function statusBadgeLabel(status: TradeVerificationResult['verificationStatus']): string {
  switch (status) {
    case 'verified':
      return 'Скин совпал';
    case 'mismatch':
      return 'Не совпадает';
    case 'partial':
      return 'Проверяем…';
    default:
      return 'Ожидание';
  }
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

async function resolveObservedFromPage(): Promise<{
  observedAssetId?: string;
  observedFloatValue?: string;
}> {
  const role = detectTradePageRole(window.location.pathname);
  const observed = parseObservedItemFromTradePage(role);
  if (!observed?.assetId) {
    return {};
  }

  const floatValue = await resolveObservedFloat(observed.assetId);
  return {
    observedAssetId: observed.assetId,
    ...(floatValue ? { observedFloatValue: floatValue } : {}),
  };
}

async function loadTradeForPage(): Promise<TradeVerificationResult | null> {
  const offerId = parseOfferIdFromPath(window.location.pathname);
  const observed = await resolveObservedFromPage();

  if (offerId) {
    const verified = await runtimeRequest<{ ok: boolean; trade?: TradeVerificationResult }>({
      type: TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE,
      offerId,
      ...observed,
    });
    if (verified.ok && verified.trade) {
      return verified.trade;
    }
  }

  const active = await runtimeRequest<{ ok: boolean; trades: TradeVerificationResult[] }>({
    type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
  });
  if (!active.ok || active.trades.length === 0) {
    return null;
  }

  if (offerId) {
    const fallback = active.trades.find((trade) => trade.offerId === offerId) ?? null;
    if (!fallback) {
      return null;
    }
    if (!observed.observedAssetId && !observed.observedFloatValue) {
      return fallback;
    }
    const reverified = await runtimeRequest<{ ok: boolean; trade?: TradeVerificationResult }>({
      type: TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE,
      orderId: fallback.orderId,
      offerId,
      ...observed,
    });
    return reverified.ok && reverified.trade ? reverified.trade : fallback;
  }

  if (window.location.pathname.includes('/tradeoffer/new')) {
    return (
      active.trades.find(
        (trade) =>
          trade.role === 'seller' &&
          trade.orderStatus === 'WAITING_TRADE' &&
          !trade.offerId,
      ) ?? null
    );
  }

  return null;
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

function renderCheckSummary(trade: TradeVerificationResult): string {
  if (trade.checks.length === 0) {
    return '';
  }
  const passed = trade.checks.filter((check) => check.passed).length;
  const total = trade.checks.length;
  if (passed === total) {
    return `<p class="check-summary ok">Проверки: ${passed}/${total} ✓</p>`;
  }
  return `<p class="check-summary warn">Проверки: ${passed}/${total}</p>`;
}

function primaryCtaHtml(trade: TradeVerificationResult): string {
  const status = trade.verificationStatus;
  if (status === 'mismatch') {
    return `<a class="btn primary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">Открыть заказ — не принимайте</a>`;
  }

  if (trade.role === 'buyer') {
    const onOfferPage = Boolean(parseOfferIdFromPath(window.location.pathname));
    if (onOfferPage) {
      return `<p class="primary-hint">Примите обмен кнопкой Steam на этой странице</p>`;
    }
    return `<a class="btn primary" href="${STEAM_INCOMING_OFFERS_URL}" target="_blank" rel="noreferrer">Открыть входящие предложения</a>`;
  }

  if (trade.nextAction.kind === 'confirm_guard') {
    return `<p class="primary-hint">Подтвердите отправку в Steam Guard на телефоне</p>`;
  }

  if (!trade.offerId) {
    return `<p class="primary-hint">Расширение отправит обмен само — ничего нажимать не нужно</p>`;
  }

  return `<p class="primary-hint">Ждём покупателя — обмен уже ушёл</p>`;
}

function buildPanel(trade: TradeVerificationResult): HTMLElement {
  const host = document.createElement('div');
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const status = trade.verificationStatus;
  const imageUrl = getItemImageUrl(trade.item.iconUrl);
  const floatLabel = trade.item.floatValue ? ` · Float ${escapeHtml(trade.item.floatValue)}` : '';
  const wearLabel = trade.item.wear ? escapeHtml(trade.item.wear) : '';

  const showPreAccept =
    trade.role === 'buyer' &&
    trade.orderStatus === 'WAITING_TRADE' &&
    status !== 'mismatch' &&
    !trade.acknowledgments.buyerPreAccept &&
    !trade.acknowledgments.buyerReceived &&
    Boolean(trade.offerId);
  const showConfirmReceived =
    trade.role === 'buyer' &&
    status !== 'mismatch' &&
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
    !trade.acknowledgments.sellerAckSent;
  const showAckSection = showSellerAckSent || showPreAccept || showConfirmReceived;

  shadow.innerHTML = `
    <style>
      .panel {
        position: fixed; top: 72px; right: 16px; z-index: 2147483646;
        width: min(340px, calc(100vw - 32px)); border-radius: 14px; padding: 14px;
        font-family: "Segoe UI", system-ui, sans-serif; color: #e8e8e8; background: #12161e;
        border: 1px solid #2f3542; box-shadow: 0 16px 48px rgba(0,0,0,.5);
      }
      .rip-verified { border-color: #2f6f46; }
      .rip-mismatch { border-color: #8f3d3d; }
      .rip-partial { border-color: #6f5d2f; }
      .hero {
        display: grid; grid-template-columns: 72px 1fr; gap: 12px;
        align-items: center; margin-bottom: 12px;
      }
      .preview {
        width: 72px; height: 54px; border-radius: 8px; object-fit: contain;
        background: #0b0e14; border: 1px solid #2a3140;
      }
      .preview-fallback {
        width: 72px; height: 54px; border-radius: 8px; display: grid; place-items: center;
        background: #0b0e14; border: 1px solid #2a3140; color: #7d8594; font-size: 11px;
      }
      .badge {
        display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
        border-radius: 999px; margin-bottom: 4px; background: #2a2f3a; color: #c7ccd6;
      }
      .rip-verified .badge { background: rgba(47,111,70,.35); color: #8fe6a4; }
      .rip-mismatch .badge { background: rgba(143,61,61,.35); color: #f0a8a8; }
      .rip-partial .badge { background: rgba(111,93,47,.35); color: #f0d78a; }
      .title { font-size: 14px; font-weight: 700; margin: 0 0 4px; line-height: 1.3; }
      .subtitle { font-size: 12px; color: #a8adb8; margin: 0; line-height: 1.35; }
      .item-name { font-size: 12px; color: #c7ccd6; margin: 0 0 10px; }
      .meta { font-size: 11px; color: #7d8594; margin: 0 0 10px; }
      .check-summary { font-size: 12px; margin: 0 0 6px; }
      .check-summary.ok { color: #8fe6a4; }
      .check-summary.warn { color: #f0d78a; }
      .checks { margin: 0 0 10px; padding: 0; list-style: none; }
      .checks li { font-size: 12px; margin: 4px 0; color: #c7ccd6; }
      .checks li.error { color: #f0a8a8; }
      .checks li.warn { color: #f0d78a; }
      .primary-hint {
        margin: 0 0 10px; padding: 10px 12px; border-radius: 8px;
        background: rgba(91,141,239,.16); border: 1px solid rgba(91,141,239,.35);
        font-size: 13px; font-weight: 600; color: #d7e4ff; text-align: center;
      }
      .rip-mismatch .primary-hint {
        background: rgba(143,61,61,.2); border-color: rgba(143,61,61,.45); color: #f0a8a8;
      }
      .actions { display: grid; gap: 8px; }
      button, a.btn {
        display: block; text-align: center; text-decoration: none; border: none;
        border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer;
      }
      .primary { background: #5b8def; color: #fff; }
      .secondary { background: #2a2f3a; color: #e8e8e8; }
      .primary:disabled, .secondary:disabled { opacity: .55; cursor: not-allowed; }
      .escrow { font-size: 12px; color: #8fe6a4; margin: 0 0 8px; }
      details.ack {
        margin-top: 4px; border-top: 1px solid #2a3140; padding-top: 8px;
      }
      details.ack summary {
        cursor: pointer; font-size: 12px; color: #a8adb8; user-select: none;
      }
      details.ack .ack-body { display: grid; gap: 8px; margin-top: 8px; }
      details.ack .ack-note { margin: 0; font-size: 11px; color: #7d8594; }
    </style>
    <div class="panel ${statusClass(status)}">
      <div class="hero">
        ${
          imageUrl
            ? `<img class="preview" src="${escapeHtml(imageUrl)}" alt="" />`
            : `<div class="preview-fallback">CS2</div>`
        }
        <div>
          <span class="badge">${statusBadgeLabel(status)}</span>
          <p class="title">${escapeHtml(trade.nextAction.title)}</p>
          <p class="subtitle">${escapeHtml(trade.nextAction.description)}</p>
        </div>
      </div>
      <p class="item-name"><strong>${escapeHtml(trade.item.marketHashName)}</strong>${
        wearLabel ? ` · ${wearLabel}` : ''
      }${floatLabel}</p>
      <p class="meta">Заказ #${escapeHtml(trade.orderShortId)} · ${formatMoneyMinor(trade.amountMinor)}</p>
      ${
        trade.escrow.status === 'active'
          ? `<p class="escrow">Средства в hold: ${formatMoneyMinor(trade.escrow.holdAmountMinor)}</p>`
          : ''
      }
      ${renderCheckSummary(trade)}
      ${renderFailedChecks(trade)}
      <div class="actions">
        ${primaryCtaHtml(trade)}
        <a class="btn secondary" href="${escapeHtml(trade.siteUrl)}" target="_blank" rel="noreferrer">Открыть заказ на сайте</a>
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
    </div>
  `;

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

function replacePanel(trade: TradeVerificationResult): void {
  document.getElementById(PANEL_ID)?.remove();
  document.documentElement.appendChild(buildPanel(trade));
}

let refreshInFlight = false;

async function refreshPanel(): Promise<void> {
  if (refreshInFlight) {
    return;
  }
  refreshInFlight = true;
  try {
    const trade = await loadTradeForPage();
    if (!trade) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    replacePanel(trade);
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
  const trade = await loadTradeForPage();
  if (!trade) {
    return;
  }
  replacePanel(trade);
  watchTradeOfferDom();
}

void mountPanel();
