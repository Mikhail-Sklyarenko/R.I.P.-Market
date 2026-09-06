/**
 * P3: Shared deal-confirm flow for Steam panel + popup.
 * One source of truth for when the buyer must tap “item is mine”.
 */
import type {
  ActiveTradeDeliveryProgress,
  TradeVerificationResult,
} from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export type DealConfirmPhase =
  | 'accept_steam'
  | 'confirm_received'
  | 'verifying'
  | 'done'
  | 'guard'
  | 'other';

export type DealConfirmBanner = {
  phase: DealConfirmPhase;
  title: string;
  body: string;
  tone: 'ok' | 'info' | 'warn';
};

export function isDeliveryDualSignalOk(
  progress: ActiveTradeDeliveryProgress | null | undefined,
): boolean {
  if (!progress) {
    return false;
  }
  const inventoryOk =
    progress.inventoryTone === 'ok' || progress.inventoryHint === 'confirmed';
  return progress.offerTone === 'ok' && inventoryOk;
}

/**
 * When true, show primary “Предмет у меня” in extension surfaces.
 * Skip when dual-signal already confirmed or settlement hold has started.
 */
export function needsBuyerReceivedConfirm(
  trade: TradeVerificationResult,
  options?: { acceptAssistDone?: boolean },
): boolean {
  if (trade.role !== 'buyer') {
    return false;
  }
  if (trade.acknowledgments.buyerReceived) {
    return false;
  }
  if (!trade.offerId?.trim()) {
    return false;
  }
  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue' ||
    trade.orderStatus === 'DISPUTE'
  ) {
    return false;
  }
  if (isDeliveryDualSignalOk(trade.deliveryProgress)) {
    return false;
  }
  // Hold means platform already moved past delivery confirm — calm status only.
  if (trade.orderStatus === 'SETTLEMENT_HOLD') {
    return false;
  }
  if (trade.nextAction.kind === 'confirm_received') {
    return true;
  }
  if (trade.orderStatus === 'TRADE_CONFIRMED') {
    return true;
  }
  if (
    options?.acceptAssistDone === true &&
    trade.orderStatus === 'WAITING_TRADE'
  ) {
    return true;
  }
  return false;
}

export function resolveDealConfirmPhase(
  trade: TradeVerificationResult,
  options?: { acceptAssistDone?: boolean },
): DealConfirmPhase {
  if (trade.nextAction.kind === 'confirm_guard') {
    return 'guard';
  }
  if (needsBuyerReceivedConfirm(trade, options)) {
    return 'confirm_received';
  }
  // Hold / completed beat "platform_verifying" copy — calm "done", not another tap.
  if (
    trade.orderStatus === 'SETTLEMENT_HOLD' ||
    trade.nextAction.kind === 'completed' ||
    trade.acknowledgments.buyerReceived
  ) {
    return 'done';
  }
  if (
    trade.nextAction.kind === 'accept_in_steam' ||
    (trade.role === 'buyer' &&
      trade.orderStatus === 'WAITING_TRADE' &&
      Boolean(trade.offerId))
  ) {
    return 'accept_steam';
  }
  if (
    trade.nextAction.kind === 'platform_verifying' ||
    trade.orderStatus === 'TRADE_CONFIRMED'
  ) {
    return 'verifying';
  }
  return 'other';
}

export function buildDealConfirmBanner(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
  options?: { acceptAssistDone?: boolean },
): DealConfirmBanner | null {
  const t = createExtensionT(locale);
  const phase = resolveDealConfirmPhase(trade, options);

  switch (phase) {
    case 'confirm_received':
      return {
        phase,
        title: t('dealConfirm.receivedTitle'),
        body: t('dealConfirm.receivedBody'),
        tone: 'ok',
      };
    case 'verifying':
      return {
        phase,
        title: t('dealConfirm.verifyingTitle'),
        body: t('dealConfirm.verifyingBody'),
        tone: 'info',
      };
    case 'done':
      return {
        phase,
        title: t('dealConfirm.doneTitle'),
        body: t('dealConfirm.doneBody'),
        tone: 'ok',
      };
    case 'guard':
      return {
        phase,
        title: t('dealConfirm.guardTitle'),
        body: t('dealConfirm.guardBody'),
        tone: 'warn',
      };
    case 'accept_steam':
      return {
        phase,
        title: t('dealConfirm.acceptTitle'),
        body: t('dealConfirm.acceptBody'),
        tone: 'info',
      };
    default:
      return null;
  }
}

export function dealConfirmBannerHtml(
  banner: DealConfirmBanner,
  escapeHtml: (value: string) => string,
): string {
  return `<div class="deal-confirm tone-${banner.tone}" data-phase="${escapeHtml(banner.phase)}">
    <p class="deal-confirm-title">${escapeHtml(banner.title)}</p>
    <p class="deal-confirm-body">${escapeHtml(banner.body)}</p>
  </div>`;
}
