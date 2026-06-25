export type TradeProviderType = 'mock' | 'steam';

export type TradeCompletionType =
  | 'SUCCESS'
  | 'FAIL_SAFE'
  | 'FAIL_DISPUTE'
  | 'TIMEOUT';

export type TradeCompletionResult = {
  providerRef: string;
  failReasonCode?: string;
};

export type TradeVerificationResult = {
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'unknown';
  tradable: boolean | null;
  tradeLockUntil: Date | null;
};

export interface TradeProvider {
  readonly type: TradeProviderType;
  completeTrade(
    orderId: string,
    type: TradeCompletionType,
    options?: { reasonCode?: string },
  ): Promise<TradeCompletionResult>;
  verifyTradeOffer?(_tradeOfferId: string): Promise<TradeVerificationResult>;
}
