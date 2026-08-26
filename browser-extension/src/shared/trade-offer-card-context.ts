/**
 * F3: History / context on Steam trade-offer cards.
 * Compact strip: order short id, price, role, platform status.
 * H1: role/status labels follow extension locale.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import { formatMoneyMinor } from './trade-offers-list-marking.js';

export type OfferCardContextTone = 'ok' | 'warn' | 'error' | 'neutral' | 'info';

export type OfferCardContext = {
  orderShortId: string;
  priceLabel: string;
  roleLabel: string;
  platformStatusLabel: string;
  platformStatusTone: OfferCardContextTone;
  /** Single line for the card strip. */
  summaryLine: string;
  itemName: string;
  nextActionTitle: string;
};

export function roleLabelForTrade(
  role: TradeVerificationResult['role'],
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): string {
  const t = createExtensionT(locale);
  return role === 'buyer' ? t('cardContext.buy') : t('cardContext.sell');
}

/**
 * Human platform status for the tradeoffers console — prefer next-step clarity
 * over raw enum names.
 */
export function platformStatusForTrade(
  trade: Pick<
    TradeVerificationResult,
    'orderStatus' | 'verificationStatus' | 'nextAction' | 'role'
  >,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): { label: string; tone: OfferCardContextTone } {
  const t = createExtensionT(locale);
  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue' ||
    trade.orderStatus === 'DISPUTE'
  ) {
    return {
      label:
        trade.orderStatus === 'DISPUTE'
          ? t('cardContext.dispute')
          : t('cardContext.mismatch'),
      tone: 'error',
    };
  }

  switch (trade.nextAction.kind) {
    case 'confirm_guard':
      return { label: t('cardContext.waitGuard'), tone: 'warn' };
    case 'accept_in_steam':
      return { label: t('cardContext.waitAccept'), tone: 'ok' };
    case 'send_manual':
      return { label: t('cardContext.sendManual'), tone: 'warn' };
    case 'confirm_sent':
      return { label: t('cardContext.confirmSent'), tone: 'info' };
    case 'confirm_received':
      return { label: t('cardContext.confirmReceived'), tone: 'info' };
    case 'platform_verifying':
      return { label: t('cardContext.platformCheck'), tone: 'info' };
    case 'completed':
      return { label: t('cardContext.completed'), tone: 'ok' };
    default:
      break;
  }

  switch (trade.orderStatus) {
    case 'WAITING_TRADE':
      if (trade.verificationStatus === 'verified') {
        return {
          label:
            trade.role === 'buyer'
              ? t('cardContext.offerReady')
              : t('cardContext.waitBuyer'),
          tone: 'ok',
        };
      }
      if (trade.verificationStatus === 'partial') {
        return { label: t('cardContext.checking'), tone: 'warn' };
      }
      return { label: t('cardContext.waitTrade'), tone: 'neutral' };
    case 'TRADE_CONFIRMED':
      return { label: t('cardContext.tradeConfirmed'), tone: 'ok' };
    case 'SETTLEMENT_HOLD':
      return { label: t('cardContext.hold'), tone: 'info' };
    case 'COMPLETED':
      return { label: t('cardContext.completed'), tone: 'ok' };
    case 'CANCELLED':
    case 'REFUNDED':
      return {
        label:
          trade.orderStatus === 'REFUNDED'
            ? t('cardContext.failed')
            : t('cardContext.canceled'),
        tone: 'neutral',
      };
    default:
      return {
        label:
          trade.nextAction.title?.trim() ||
          trade.orderStatus ||
          t('cardContext.inProgress'),
        tone: 'neutral',
      };
  }
}

export function buildOfferCardContext(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): OfferCardContext {
  const roleLabel = roleLabelForTrade(trade.role, locale);
  const priceLabel = formatMoneyMinor(trade.amountMinor);
  const platform = platformStatusForTrade(trade, locale);
  const orderShortId = trade.orderShortId.trim() || trade.orderId.slice(0, 8);
  return {
    orderShortId,
    priceLabel,
    roleLabel,
    platformStatusLabel: platform.label,
    platformStatusTone: platform.tone,
    summaryLine: `#${orderShortId} · ${priceLabel} · ${roleLabel} · ${platform.label}`,
    itemName: trade.item.marketHashName,
    nextActionTitle: trade.nextAction.title,
  };
}
