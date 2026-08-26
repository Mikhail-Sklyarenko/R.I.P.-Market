/**
 * G3: Post-trade receipt — calm summary after COMPLETED
 * (item, price, fee, offerId, order link).
 * H1: copy follows extension locale.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export type PostTradeReceiptView = {
  orderId: string;
  orderShortId: string;
  role: 'buyer' | 'seller';
  /** «Купили» / «Продали» */
  verbLabel: string;
  eyebrowLabel: string;
  openOrderLabel: string;
  itemName: string;
  priceMinor: string;
  commissionMinor: string;
  /** Buyer: amount paid; seller: net after fee. */
  netMinor: string;
  priceCaption: string;
  commissionCaption: string;
  netCaption: string;
  offerId: string | null;
  orderHref: string;
};

export function resolveCommissionMinor(
  priceMinor: string,
  commissionMinor?: string | null,
): string {
  const explicit = commissionMinor?.trim();
  if (explicit && /^\d+$/.test(explicit)) {
    return explicit;
  }
  const price = Number(priceMinor);
  if (!Number.isFinite(price) || price < 0) {
    return '0';
  }
  return String(Math.floor(price * 0.05));
}

export function resolveSellerReceiveMinor(
  priceMinor: string,
  commissionMinor: string,
  sellerReceiveMinor?: string | null,
): string {
  const explicit = sellerReceiveMinor?.trim();
  if (explicit && /^\d+$/.test(explicit)) {
    return explicit;
  }
  const price = Number(priceMinor);
  const fee = Number(commissionMinor);
  if (!Number.isFinite(price) || !Number.isFinite(fee)) {
    return priceMinor;
  }
  return String(Math.max(0, price - fee));
}

export function canShowPostTradeReceipt(
  trade: Pick<TradeVerificationResult, 'orderStatus' | 'nextAction'>,
): boolean {
  return (
    trade.orderStatus === 'COMPLETED' || trade.nextAction.kind === 'completed'
  );
}

/**
 * Build receipt view model for popup / overlay.
 */
export function buildPostTradeReceipt(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): PostTradeReceiptView | null {
  if (!canShowPostTradeReceipt(trade)) {
    return null;
  }

  const t = createExtensionT(locale);
  const priceMinor = trade.amountMinor;
  const commissionMinor = resolveCommissionMinor(
    priceMinor,
    trade.commissionMinor,
  );
  const sellerReceive = resolveSellerReceiveMinor(
    priceMinor,
    commissionMinor,
    trade.sellerReceiveMinor,
  );
  const isBuyer = trade.role === 'buyer';

  return {
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    role: trade.role,
    verbLabel: isBuyer ? t('receipt.bought') : t('receipt.sold'),
    eyebrowLabel: t('receipt.eyebrow'),
    openOrderLabel: t('receipt.openOrder'),
    itemName: trade.item.marketHashName,
    priceMinor,
    commissionMinor,
    netMinor: isBuyer ? priceMinor : sellerReceive,
    priceCaption: t('receipt.price'),
    commissionCaption: t('receipt.commission'),
    netCaption: isBuyer ? t('receipt.paid') : t('receipt.credited'),
    offerId: trade.offerId?.trim() || null,
    orderHref: trade.siteUrl,
  };
}

export function postTradeReceiptHtml(
  view: PostTradeReceiptView,
  escapeHtml: (value: string) => string,
  formatMoney: (minor: string) => string,
): string {
  const offerRow = view.offerId
    ? `<div class="receipt-row"><span>Steam offer</span><strong>${escapeHtml(view.offerId)}</strong></div>`
    : '';
  return `
    <article class="receipt-card" data-receipt-order="${escapeHtml(view.orderId)}">
      <p class="receipt-eyebrow">${escapeHtml(view.eyebrowLabel)}</p>
      <h2 class="receipt-title">${escapeHtml(view.verbLabel)} · ${escapeHtml(view.itemName)}</h2>
      <p class="receipt-meta">#${escapeHtml(view.orderShortId)}</p>
      <div class="receipt-rows">
        <div class="receipt-row"><span>${escapeHtml(view.priceCaption)}</span><strong>${escapeHtml(formatMoney(view.priceMinor))}</strong></div>
        <div class="receipt-row"><span>${escapeHtml(view.commissionCaption)}</span><strong>${escapeHtml(formatMoney(view.commissionMinor))}</strong></div>
        <div class="receipt-row receipt-row-net"><span>${escapeHtml(view.netCaption)}</span><strong>${escapeHtml(formatMoney(view.netMinor))}</strong></div>
        ${offerRow}
      </div>
      <a class="btn secondary" href="${escapeHtml(view.orderHref)}" target="_blank" rel="noreferrer">${escapeHtml(view.openOrderLabel)}</a>
    </article>
  `;
}

export function buildRecentReceipts(
  trades: TradeVerificationResult[],
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): PostTradeReceiptView[] {
  const out: PostTradeReceiptView[] = [];
  for (const trade of trades) {
    const view = buildPostTradeReceipt(trade, locale);
    if (view) {
      out.push(view);
    }
  }
  return out;
}
