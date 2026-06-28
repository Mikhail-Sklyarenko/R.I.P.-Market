export type SettlementBlockCode =
  | 'REAL_SETTLEMENT_DISABLED'
  | 'NOT_LIVE_MODE'
  | 'TRADE_NOT_CONFIRMED'
  | 'ORDER_NOT_TRADE_CONFIRMED'
  | 'MISSING_BUYER_STEAM_ID'
  | 'MISSING_SELLER_STEAM_ID'
  | 'BUYER_NOT_ALLOWLISTED'
  | 'SELLER_NOT_ALLOWLISTED'
  | 'ORDER_AMOUNT_EXCEEDS_LIMIT'
  | 'DAILY_ORDER_LIMIT'
  | 'DAILY_VOLUME_LIMIT';

export type SettlementGuardResult =
  | { allowed: true }
  | { allowed: false; code: SettlementBlockCode; reason: string };
