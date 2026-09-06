import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

/**
 * Resolve which active trade belongs to a Steam offer page.
 * Prefer exact offerId; fall back to a single WAITING_TRADE deal or asset match
 * so buyers are not shown "Не наша сделка" while link race is in flight.
 */
export function resolveTradeForOfferPage(params: {
  trades: TradeVerificationResult[];
  offerId: string | null;
  observedAssetId?: string | null;
  roleHint?: 'buyer' | 'seller' | null;
}): TradeVerificationResult | null {
  const offerId = params.offerId?.trim() || null;
  if (offerId) {
    const byOffer =
      params.trades.find(
        (trade) => trade.offerId?.trim() === offerId,
      ) ?? null;
    if (byOffer) {
      return byOffer;
    }
  }

  const waiting = params.trades.filter(
    (trade) =>
      trade.orderStatus === 'WAITING_TRADE' &&
      (params.roleHint ? trade.role === params.roleHint : true),
  );

  const assetId = params.observedAssetId?.trim() || null;
  if (assetId) {
    const byAsset = waiting.filter(
      (trade) => trade.item.assetExternalId?.trim() === assetId,
    );
    if (byAsset.length === 1) {
      return byAsset[0] ?? null;
    }
    if (byAsset.length > 1 && offerId) {
      // Prefer unlinked candidate when several share the asset (shouldn't).
      const unlinked = byAsset.find((trade) => !trade.offerId?.trim());
      if (unlinked) {
        return unlinked;
      }
    }
  }

  // Single in-flight deal for this role — safe to attach while offer id catches up,
  // but never when observed asset contradicts the lot (stale / wrong Steam tab).
  if (waiting.length === 1) {
    const only = waiting[0]!;
    const expectedAsset = only.item.assetExternalId?.trim() || null;
    if (assetId && expectedAsset && assetId !== expectedAsset) {
      return null;
    }
    if (!only.offerId?.trim() || (offerId && only.offerId.trim() === offerId)) {
      return only;
    }
    // Linked to a different offer — do not mis-attach.
    if (offerId && only.offerId.trim() !== offerId) {
      return null;
    }
    return only;
  }

  return null;
}
