/**
 * Shared rules for when seller should leave auto-offer and send manually.
 * Keep in sync with frontend/src/utils/manual-fallback.ts.
 */

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

export type ManualFallbackTaskProbe = {
  status?: string | null;
  executionPhase?: string | null;
  lastErrorCode?: string | null;
  attemptCount?: number | null;
  maxAttempts?: number | null;
};

export function isTradeTaskDeliveryCheck(
  task: ManualFallbackTaskProbe | null | undefined,
): boolean {
  if (!task) {
    return false;
  }
  return (
    task.lastErrorCode === 'ITEM_ALREADY_GONE' ||
    ((task.status === 'FAILED' || task.executionPhase === 'OFFER_FAILED') &&
      task.lastErrorCode === 'ITEM_MISSING')
  );
}

export function isSellerManualFallbackNeeded(params: {
  orderStatus: string;
  externalOfferId?: string | null;
  task?: ManualFallbackTaskProbe | null;
}): boolean {
  if (params.orderStatus !== 'WAITING_TRADE') {
    return false;
  }
  if (params.externalOfferId) {
    return false;
  }
  if (isTradeTaskDeliveryCheck(params.task)) {
    return false;
  }

  const task = params.task;
  if (!task) {
    return true;
  }

  if (task.status === 'FAILED' || task.status === 'EXPIRED') {
    return true;
  }
  if (task.executionPhase === 'OFFER_FAILED') {
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
