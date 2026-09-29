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
  /** Safe diagnostic category, never an upstream message or credential. */
  reasonCode?: string;
  /** Set only from a validated server-side Steam receipt. */
  receivedAssetId?: string;
  status:
    | 'needs_confirmation'
    | 'pending'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'unknown';
  tradable: boolean | null;
  tradeLockUntil: Date | null;
};

export type TradeVerificationContext = {
  sellerSteamId: string | null;
  buyerSteamId: string | null;
  assetId: string;
};

export interface TradeProvider {
  readonly type: TradeProviderType;
  completeTrade(
    orderId: string,
    type: TradeCompletionType,
    options?: { reasonCode?: string },
  ): Promise<TradeCompletionResult>;
  verifyTradeOffer?(
    _tradeOfferId: string,
    context?: TradeVerificationContext,
  ): Promise<TradeVerificationResult>;
}
