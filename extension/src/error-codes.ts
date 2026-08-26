export const OfferErrorCode = {
  BUYER_TRADE_URL_INVALID: 'BUYER_TRADE_URL_INVALID',
  BUYER_TRADE_URL_MISSING: 'BUYER_TRADE_URL_MISSING',
  ITEM_MISSING: 'ITEM_MISSING',
  ITEM_MISMATCH: 'ITEM_MISMATCH',
  INVENTORY_NOT_LOADED: 'INVENTORY_NOT_LOADED',
  INVENTORY_PRIVATE: 'INVENTORY_PRIVATE',
  INVENTORY_RATE_LIMITED: 'INVENTORY_RATE_LIMITED',
  STEAM_COOKIE_EXPIRED: 'STEAM_COOKIE_EXPIRED',
  STEAM_UNAVAILABLE: 'STEAM_UNAVAILABLE',
  STEAM_GUARD_REQUIRED: 'STEAM_GUARD_REQUIRED',
  CONFIRM_PENDING: 'CONFIRM_PENDING',
  OFFER_SEND_FAILED: 'OFFER_SEND_FAILED',
  OFFER_DRAFT_FAILED: 'OFFER_DRAFT_FAILED',
  STEAM_ACCOUNT_MISMATCH: 'STEAM_ACCOUNT_MISMATCH',
  TRADE_HOLD_BLOCKED: 'TRADE_HOLD_BLOCKED',
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

export type OfferErrorCodeType =
  (typeof OfferErrorCode)[keyof typeof OfferErrorCode];

export const OFFER_ERROR_FALLBACK: Record<
  OfferErrorCodeType,
  { retryable: boolean; fallback: 'retry' | 'manual' | 'dispute' }
> = {
  BUYER_TRADE_URL_INVALID: { retryable: true, fallback: 'retry' },
  BUYER_TRADE_URL_MISSING: { retryable: true, fallback: 'manual' },
  ITEM_MISSING: { retryable: true, fallback: 'retry' },
  ITEM_MISMATCH: { retryable: false, fallback: 'dispute' },
  INVENTORY_NOT_LOADED: { retryable: true, fallback: 'retry' },
  INVENTORY_PRIVATE: { retryable: true, fallback: 'manual' },
  INVENTORY_RATE_LIMITED: { retryable: true, fallback: 'retry' },
  STEAM_COOKIE_EXPIRED: { retryable: true, fallback: 'manual' },
  STEAM_UNAVAILABLE: { retryable: true, fallback: 'retry' },
  STEAM_GUARD_REQUIRED: { retryable: false, fallback: 'manual' },
  CONFIRM_PENDING: { retryable: false, fallback: 'manual' },
  OFFER_SEND_FAILED: { retryable: true, fallback: 'manual' },
  OFFER_DRAFT_FAILED: { retryable: false, fallback: 'manual' },
  STEAM_ACCOUNT_MISMATCH: { retryable: false, fallback: 'manual' },
  TRADE_HOLD_BLOCKED: { retryable: false, fallback: 'manual' },
  SESSION_REVOKED: { retryable: false, fallback: 'manual' },
};
