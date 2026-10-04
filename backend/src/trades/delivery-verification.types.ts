import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';
import type { InventoryDeltaResult } from './trade-inventory-delta.service';

export type DeliveryVerificationAction =
  | 'WAIT'
  | 'CONFIRM'
  | 'FAIL'
  | 'DISPUTE'
  | 'TIMEOUT'
  | 'BACKOFF'
  | 'MANUAL_REVIEW';

export type DeliveryVerificationReason =
  | 'RECEIPT_AUTHORITY_CONFIRMED'
  | 'TRADE_TIMEOUT'
  | 'RATE_LIMITED'
  | 'OFFER_PENDING'
  | 'OFFER_NEEDS_CONFIRMATION'
  | 'INVENTORY_PENDING'
  | 'DUAL_SIGNAL_CONFIRMED'
  | 'INVENTORY_ONLY_CONFIRMED'
  | 'LEGACY_OFFER_ACCEPTED'
  | 'LEGACY_INVENTORY_CONFIRMED'
  | 'OFFER_DECLINED'
  | 'OFFER_EXPIRED'
  | 'OFFER_UNKNOWN'
  | 'DELIVERY_INVENTORY_MISMATCH'
  | 'DELIVERY_SIGNAL_CONFLICT'
  | 'DELIVERY_VERIFICATION_UNKNOWN'
  | 'INVENTORY_UNKNOWN_EXHAUSTED'
  | 'OFFER_ACCEPTED_INVENTORY_LAG'
  | 'OFFER_ACCEPTED_INVENTORY_UNKNOWN'
  | 'INVENTORY_CONFIRMED_OFFER_UNKNOWN';

export type DeliveryVerificationDecision = {
  action: DeliveryVerificationAction;
  reason: DeliveryVerificationReason;
  reasonCode: string;
  pollOutcome: string;
  offerStatus: string | null;
  inventoryDelta: InventoryDeltaResult | null;
};

export type DeliveryVerificationSignals = {
  engineEnabled: boolean;
  shadowMode: boolean;
  hasOfferId: boolean;
  offerStatus: TradeVerificationResult['status'] | null;
  inventoryDelta: InventoryDeltaResult | null;
  buyerAckReceived: boolean;
  timedOut: boolean;
  rateLimited: boolean;
  checkCount: number;
  offerUnknownStreak?: number;
  inventoryUnknownStreak?: number;
  acceptedPendingStreak?: number;
  receiptProofPersisted?: boolean;
  failMode: 'SAFE' | 'DISPUTE';
};

export type DeliveryVerificationEvidence = {
  receiptProofPersisted?: boolean;
  deliveryAuthority?: 'STEAM_RECEIPT';
  offerStatus: TradeVerificationResult['status'] | null;
  inventoryDelta: InventoryDeltaResult | null;
  reason: DeliveryVerificationReason;
  reasonCode: string;
  engineEnabled: boolean;
};
