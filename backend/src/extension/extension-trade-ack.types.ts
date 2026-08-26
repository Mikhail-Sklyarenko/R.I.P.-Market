export type TradeAcknowledgmentType =
  | 'SELLER_ACK_SENT'
  | 'BUYER_ACK_PRE_ACCEPT'
  | 'BUYER_ACK_RECEIVED';

export type TradeVerificationCheckSeverity = 'ok' | 'warn' | 'error';

export type TradeVerificationCheck = {
  key: string;
  passed: boolean;
  label: string;
  severity: TradeVerificationCheckSeverity;
};

export type TradeVerificationStatus =
  | 'verified'
  | 'partial'
  | 'mismatch'
  | 'pending';

export type TradeAcknowledgmentState = {
  sellerAckSent: boolean;
  buyerPreAccept: boolean;
  buyerReceived: boolean;
};

export type ActiveTradeCounterparty = {
  userId: string;
  username: string;
  steamId: string | null;
  personaName: string | null;
  avatarUrl: string | null;
};

export type ListingSticker = {
  name: string;
  wearPercent: number | null;
};

export type ActiveTradeItem = {
  marketHashName: string;
  floatValue: string | null;
  wear: string | null;
  iconUrl: string | null;
  assetExternalId: string;
  stickers?: ListingSticker[];
};

export type ActiveTradeEscrow = {
  holdAmountMinor: string;
  status: 'active' | 'released' | 'none';
};

export type ActiveTradeNextAction = {
  title: string;
  description: string;
  kind:
    | 'wait'
    | 'accept_in_steam'
    | 'confirm_guard'
    | 'send_manual'
    | 'confirm_sent'
    | 'confirm_received'
    | 'platform_verifying'
    | 'completed'
    | 'report_issue';
};

export type ActiveTradeDeliverySignalTone = 'ok' | 'pending' | 'warn' | 'unknown';

export type ActiveTradeDeliveryProgress = {
  offerTone: ActiveTradeDeliverySignalTone;
  inventoryTone: ActiveTradeDeliverySignalTone;
  offerStatus: string | null;
  inventoryHint:
    | 'seller_still_holds'
    | 'confirmed'
    | 'pending'
    | 'unknown'
    | null;
  outcome: string | null;
  checkedAt: string | null;
};

export type TradeVerificationResult = {
  orderId: string;
  orderShortId: string;
  role: 'buyer' | 'seller';
  orderStatus: string;
  offerId: string | null;
  verificationStatus: TradeVerificationStatus;
  checks: TradeVerificationCheck[];
  item: ActiveTradeItem;
  counterparty: ActiveTradeCounterparty;
  escrow: ActiveTradeEscrow;
  acknowledgments: TradeAcknowledgmentState;
  nextAction: ActiveTradeNextAction;
  siteUrl: string;
  amountMinor: string;
  /** ISO timestamp when the order was created (trade window start). */
  createdAt?: string;
  /** ISO deadline for TRADE_TIMEOUT auto-dispute. */
  tradeTimeoutAt?: string;
  /** Present for sellers when manual send is needed (buyer Trade URL). */
  buyerTradeUrl?: string | null;
  /** G1: ISO when settlement hold unlocks seller funds (8-day window). */
  settlementHoldUntil?: string | null;
  /** G1: dual-signal delivery verification progress after Steam accept. */
  deliveryProgress?: ActiveTradeDeliveryProgress | null;
  /** G3: platform fee (minor units). */
  commissionMinor?: string | null;
  /** G3: seller net after fee (minor units). */
  sellerReceiveMinor?: string | null;
};

export type TradeAcknowledgmentSummary = {
  sellerAckSent: boolean;
  buyerPreAccept: boolean;
  buyerReceived: boolean;
};
