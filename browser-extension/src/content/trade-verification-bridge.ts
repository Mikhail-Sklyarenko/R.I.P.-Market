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

function statusClass(status: TradeVerificationResult['verificationStatus']): string {
  if (status === 'verified') return 'rip-verified';
  if (status === 'mismatch') return 'rip-mismatch';
  if (status === 'partial') return 'rip-partial';
  return 'rip-pending';
}

function statusTitle(status: TradeVerificationResult['verificationStatus']): string {
  switch (status) {
    case 'verified':
      return 'Подтверждённая сделка R.I.P Market';
    case 'mismatch':
      return 'Обмен не совпадает с заказом';
    case 'partial':
      return 'Сделка R.I.P Market (ожидаем обмен)';
    default:
      return 'Сделка R.I.P Market';
  }
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

function renderChecks(trade: TradeVerificationResult): string {
  return trade.checks
    .map((check) => {
      const icon = check.passed ? '✓' : check.severity === 'error' ? '✕' : '•';
      return `<li class="${check.passed ? 'ok' : check.severity}">${icon} ${check.label}</li>`;
    })
    .join('');
}

function buildPanel(trade: TradeVerificationResult): HTMLElement {
  const host = document.createElement('div');
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const status = trade.verificationStatus;
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

  shadow.innerHTML = `
    <style>
      .panel {
        position: fixed; top: 72px; right: 16px; z-index: 2147483646;
        width: min(360px, calc(100vw - 32px)); border-radius: 12px; padding: 14px 16px;
        font-family: system-ui, sans-serif; color: #e8e8e8; background: #161a22;
        border: 1px solid #2f3542; box-shadow: 0 12px 40px rgba(0,0,0,.45);
      }
      .rip-verified { border-color: #2f6f46; }
      .rip-mismatch { border-color: #8f3d3d; }
      .rip-partial { border-color: #6f5d2f; }
      .title { font-size: 14px; font-weight: 700; margin: 0 0 6px; }
      .subtitle { font-size: 12px; color: #a8adb8; margin: 0 0 10px; }
      .item { font-size: 13px; margin: 0 0 8px; }
      .checks { margin: 0 0 12px; padding: 0; list-style: none; }
      .checks li { font-size: 12px; margin: 4px 0; color: #c7ccd6; }
      .checks li.ok { color: #8fe6a4; }
      .checks li.error { color: #f0a8a8; }
      .actions { display: grid; gap: 8px; }
      button, a.btn {
        display: block; text-align: center; text-decoration: none; border: none;
        border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer;
      }
      .primary { background: #5b8def; color: #fff; }
      .secondary { background: #2a2f3a; color: #e8e8e8; }
      .primary:disabled { opacity: .55; cursor: not-allowed; }
      .escrow { font-size: 12px; color: #8fe6a4; margin-bottom: 8px; }
    </style>
    <div class="panel ${statusClass(status)}">
      <p class="title">${statusTitle(status)}</p>
      <p class="subtitle">Заказ #${trade.orderShortId} · ${formatMoneyMinor(trade.amountMinor)}</p>
      ${
        trade.item.stickers && trade.item.stickers.length > 0
          ? `<p class="item muted small">Стикеры: ${trade.item.stickers
              .map((sticker) =>
                sticker.wearPercent !== null && sticker.wearPercent !== undefined
                  ? `${sticker.name} (${sticker.wearPercent}%)`
                  : sticker.name,
              )
              .join(', ')}</p>`
          : ''
      }
      <p class="item"><strong>${trade.item.marketHashName}</strong></p>
      ${
        trade.escrow.status === 'active'
          ? `<p class="escrow">Средства в hold: ${formatMoneyMinor(trade.escrow.holdAmountMinor)}</p>`
          : ''
      }
      <ul class="checks">${renderChecks(trade)}</ul>
      <div class="actions">
        ${showSellerAckSent ? '<button class="primary" data-action="seller-sent">Я отправил обмен</button>' : ''}
        ${showPreAccept ? '<button class="primary" data-action="pre-accept">Вижу предложение</button>' : ''}
        ${showConfirmReceived ? '<button class="primary" data-action="confirm-received">Предмет получен</button>' : ''}
        ${
          trade.role === 'buyer' && status !== 'mismatch'
            ? `<a class="btn secondary" href="${STEAM_INCOMING_OFFERS_URL}" target="_blank" rel="noreferrer">Открыть входящие предложения</a>`
            : ''
        }
        <a class="btn secondary" href="${trade.siteUrl}" target="_blank" rel="noreferrer">Открыть заказ на R.I.P Market</a>
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
