import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

export type OfferMarkKind =
  | 'rip_verified'
  | 'rip_pending'
  | 'rip_mismatch'
  | 'not_ours';

export type OfferMark = {
  kind: OfferMarkKind;
  label: string;
  trade: TradeVerificationResult | null;
};

export function parseTradeOfferIdFromElementId(elementId: string): string | null {
  const match = elementId.match(/^tradeofferid_(\d+)$/i);
  return match?.[1] ?? null;
}

export function isRipOfferMark(kind: OfferMarkKind): boolean {
  return kind === 'rip_verified' || kind === 'rip_pending' || kind === 'rip_mismatch';
}

/**
 * Classifies a Steam trade-offer card against active R.I.P Market trades.
 */
export function classifyOfferMark(
  offerId: string,
  trades: TradeVerificationResult[],
): OfferMark {
  const normalized = offerId.trim();
  if (!normalized) {
    return { kind: 'not_ours', label: 'Не наша сделка', trade: null };
  }

  const trade =
    trades.find((entry) => entry.offerId && entry.offerId === normalized) ?? null;
  if (!trade) {
    return { kind: 'not_ours', label: 'Не наша сделка', trade: null };
  }

  if (trade.verificationStatus === 'mismatch') {
    return { kind: 'rip_mismatch', label: 'Подозрительно', trade };
  }
  if (trade.verificationStatus === 'verified') {
    return { kind: 'rip_verified', label: 'Сделка R.I.P', trade };
  }
  return { kind: 'rip_pending', label: 'Сделка R.I.P', trade };
}

export function formatMoneyMinor(amountMinor: string): string {
  const value = Number(amountMinor) / 100;
  if (!Number.isFinite(value)) {
    return amountMinor;
  }
  return `$${value.toFixed(2)}`;
}
