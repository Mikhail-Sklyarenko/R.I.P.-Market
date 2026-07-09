import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';
import type { InventoryDeltaResult } from './trade-inventory-delta.service';

export type DeliveryVerificationAction =
  | 'WAIT'
  | 'CONFIRM'
  | 'FAIL'
  | 'DISPUTE'
  | 'TIMEOUT'
  | 'BACKOFF';

export type DeliveryVerificationReason =
  | 'TRADE_TIMEOUT'
  | 'RATE_LIMITED'
  | 'OFFER_PENDING'
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
  | 'INVENTORY_UNKNOWN_EXHAUSTED';

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
  timedOut: boolean;
  rateLimited: boolean;
  checkCount: number;
  failMode: 'SAFE' | 'DISPUTE';
};

export type DeliveryVerificationEvidence = {
  offerStatus: TradeVerificationResult['status'] | null;
  inventoryDelta: InventoryDeltaResult | null;
  reason: DeliveryVerificationReason;
  reasonCode: string;
  engineEnabled: boolean;
};
