export type TradeAcknowledgmentType =
  | 'SELLER_ACK_SENT'
  | 'BUYER_ACK_PRE_ACCEPT'
  | 'BUYER_ACK_RECEIVED';

export type TradeVerificationCheck = {
  key: string;
  passed: boolean;
  label: string;
  severity: 'ok' | 'warn' | 'error';
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
    | 'confirm_sent'
    | 'confirm_received'
    | 'platform_verifying'
    | 'completed'
    | 'report_issue';
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
};
