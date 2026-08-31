/**
 * When seller auto-offer cannot finish, surface a shame-free manual path:
 * open buyer Trade URL → send the item → paste offer link.
 */

import { isOrderTradeDeliveryCheck } from './order-trade.ts';

export const PRIMARY_MANUAL_FALLBACK_ERROR_CODES = new Set([
  'TRADE_HOLD_BLOCKED',
  'OFFER_SEND_FAILED',
  'OFFER_DRAFT_FAILED',
  'ITEM_MISMATCH',
  'MAX_ATTEMPTS_REACHED',
  'BUYER_TRADE_URL_INVALID',
  'BUYER_TRADE_URL_MISSING',
  'STEAM_ACCOUNT_MISMATCH',
  'SESSION_REVOKED',
]);

export const STUCK_AUTO_SEND_PHASES = new Set(['CONFIRM_PENDING']);

/**
 * True when the seller should be guided through the manual send path now
 * (not buried under “waiting for auto-send”).
 */
export function isSellerManualFallbackNeeded(order: {
  status?: string | null;
  tradeOperation?: { externalOfferId?: string | null } | null;
  tradeTask?: {
    status?: string | null;
    executionPhase?: string | null;
    lastErrorCode?: string | null;
    attemptCount?: number | null;
    maxAttempts?: number | null;
  } | null;
}): boolean {
  if (order.status !== 'WAITING_TRADE') {
    return false;
  }
  if (order.tradeOperation?.externalOfferId) {
    return false;
  }
  if (isOrderTradeDeliveryCheck(order)) {
    return false;
  }

  const task = order.tradeTask;
  if (!task) {
    // No extension task — manual is the only path.
    return true;
  }

  if (task.status === 'FAILED' || task.status === 'EXPIRED') {
    return true;
  }
  if (task.executionPhase === 'OFFER_FAILED') {
    return true;
  }

  const phase = task.executionPhase?.trim();
  if (phase === 'OFFER_SENT' && !order.tradeOperation?.externalOfferId) {
    return true;
  }
  if (phase && STUCK_AUTO_SEND_PHASES.has(phase)) {
    return true;
  }

  const attempts = task.attemptCount ?? 0;
  const maxAttempts = task.maxAttempts ?? 0;
  if (maxAttempts > 0 && attempts >= maxAttempts) {
    return true;
  }

  const code = task.lastErrorCode?.trim();
  if (code && PRIMARY_MANUAL_FALLBACK_ERROR_CODES.has(code)) {
    return true;
  }

  return false;
}
