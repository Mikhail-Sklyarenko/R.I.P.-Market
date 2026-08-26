/**
 * F1: Manual create offer for an R.I.P deal from Steam tradeoffers page.
 * Uses the existing UI autofill pipeline (open Trade URL → select item → send).
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export type ManualCreateCandidate = {
  orderId: string;
  orderShortId: string;
  itemName: string;
  assetId: string;
  buyerTradeUrl: string;
  amountMinor: string;
  floatValue: string | null;
  siteUrl: string;
  reason: 'send_manual' | 'waiting_no_offer';
  ctaLabel: string;
  hint: string;
};

export function canManualCreateOffer(
  trade: Pick<
    TradeVerificationResult,
    | 'role'
    | 'orderStatus'
    | 'offerId'
    | 'nextAction'
    | 'buyerTradeUrl'
    | 'item'
  >,
): boolean {
  if (trade.role !== 'seller') {
    return false;
  }
  if (trade.orderStatus !== 'WAITING_TRADE') {
    return false;
  }
  if (trade.nextAction.kind === 'confirm_guard') {
    return false;
  }
  if (trade.offerId?.trim()) {
    return false;
  }
  if (!trade.buyerTradeUrl?.trim()) {
    return false;
  }
  if (!trade.item.assetExternalId?.trim()) {
    return false;
  }
  return (
    trade.nextAction.kind === 'send_manual' ||
    trade.nextAction.kind === 'wait' ||
    trade.nextAction.kind === 'confirm_sent'
  );
}

export function buildManualCreateCandidate(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ManualCreateCandidate | null {
  if (!canManualCreateOffer(trade)) {
    return null;
  }
  const t = createExtensionT(locale);
  const reason: ManualCreateCandidate['reason'] =
    trade.nextAction.kind === 'send_manual'
      ? 'send_manual'
      : 'waiting_no_offer';
  return {
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    itemName: trade.item.marketHashName,
    assetId: trade.item.assetExternalId,
    buyerTradeUrl: trade.buyerTradeUrl!.trim(),
    amountMinor: trade.amountMinor,
    floatValue: trade.item.floatValue,
    siteUrl: trade.siteUrl,
    reason,
    ctaLabel: t('manualCreate.buildOffer', { short: trade.orderShortId }),
    hint:
      reason === 'send_manual'
        ? t('manualCreate.autoFailed')
        : t('manualCreate.canBuild'),
  };
}

export function listManualCreateCandidates(
  trades: TradeVerificationResult[],
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ManualCreateCandidate[] {
  return trades
    .map((trade) => buildManualCreateCandidate(trade, locale))
    .filter((entry): entry is ManualCreateCandidate => entry !== null)
    .sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === 'send_manual' ? -1 : 1;
      }
      return a.orderShortId.localeCompare(b.orderShortId);
    });
}

export function buildManualCreateDraftInput(candidate: ManualCreateCandidate): {
  buyerTradeUrl: string;
  item: {
    assetId: string;
    marketHashName?: string;
    floatValue?: string | null;
  };
  taskId: string;
  note: string;
} {
  return {
    buyerTradeUrl: candidate.buyerTradeUrl,
    item: {
      assetId: candidate.assetId,
      marketHashName: candidate.itemName,
      floatValue: candidate.floatValue,
    },
    taskId: `manual-${candidate.orderId}`,
    note: `R.I.P Market order #${candidate.orderShortId}`,
  };
}
