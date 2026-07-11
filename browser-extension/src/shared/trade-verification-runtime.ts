export const TRADE_VERIFICATION_RUNTIME = {
  GET_ACTIVE_TRADES: 'RIP_MARKET_GET_ACTIVE_TRADES',
  VERIFY_TRADE: 'RIP_MARKET_VERIFY_TRADE',
  ACK_TRADE: 'RIP_MARKET_ACK_TRADE',
  REFRESH_ACTIVE_TRADES: 'RIP_MARKET_REFRESH_ACTIVE_TRADES',
  RESOLVE_ASSET_FLOAT: 'RIP_MARKET_RESOLVE_ASSET_FLOAT',
} as const;

export type VerifyTradeRuntimeRequest = {
  type: typeof TRADE_VERIFICATION_RUNTIME.VERIFY_TRADE;
  orderId?: string;
  offerId?: string;
  observedAssetId?: string;
  observedFloatValue?: string;
};

export type AckTradeRuntimeRequest = {
  type: typeof TRADE_VERIFICATION_RUNTIME.ACK_TRADE;
  orderId: string;
  ackType: 'SELLER_ACK_SENT' | 'BUYER_ACK_PRE_ACCEPT' | 'BUYER_ACK_RECEIVED';
  offerId?: string;
  idempotencyKey: string;
};
