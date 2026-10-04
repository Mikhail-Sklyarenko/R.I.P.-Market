import type {
  DeliveryVerificationDecision,
  DeliveryVerificationSignals,
} from './delivery-verification.types';
import {
  getAcceptedInventoryPendingMaxChecks,
  getInventoryUnknownMaxChecks,
  getOfferUnknownMaxChecks,
} from './delivery-verification.config';

/**
 * Financial authority requires an immutable server receipt, including legacy flag settings.
 * A client receipt, missing offer, inventory lag or retry exhaustion never
 * proves delivery. Exhaustion escalates to review; it cannot release funds.
 */
export function decideDeliveryVerification(
  signals: DeliveryVerificationSignals,
): DeliveryVerificationDecision {
  const offer = signals.offerStatus;
  const inventory = signals.inventoryDelta;
  const result = decide(signals);
  if (signals.timedOut && result.action === 'WAIT') {
    return decision(
      'MANUAL_REVIEW',
      'TRADE_TIMEOUT',
      'TRADE_TIMEOUT',
      offer,
      inventory,
    );
  }
  return result;
}

function decide(s: DeliveryVerificationSignals): DeliveryVerificationDecision {
  const offer = s.offerStatus;
  const inventory = s.inventoryDelta;
  if (s.receiptProofPersisted)
    return decision(
      'CONFIRM',
      'RECEIPT_AUTHORITY_CONFIRMED',
      'RECEIPT_AUTHORITY_CONFIRMED',
      offer,
      inventory,
      'CONFIRMED',
    );
  if (inventory === 'ambiguous')
    return decision(
      'MANUAL_REVIEW',
      'DELIVERY_VERIFICATION_UNKNOWN',
      'DESTINATION_AMBIGUOUS',
      offer,
      inventory,
      'MANUAL_REVIEW',
    );
  if (s.rateLimited) {
    if (s.timedOut) {
      return decision(
        'MANUAL_REVIEW',
        'DELIVERY_VERIFICATION_UNKNOWN',
        'STEAM_UNAVAILABLE_TIMEOUT',
        offer,
        inventory,
        'FAILED_DISPUTE',
      );
    }
    return decision(
      'BACKOFF',
      'RATE_LIMITED',
      'rate_limited',
      offer,
      inventory,
    );
  }
  if (!s.hasOfferId) {
    return decision(
      'WAIT',
      'INVENTORY_PENDING',
      inventory === 'unknown'
        ? 'INVENTORY_UNKNOWN_RETRY'
        : 'OFFER_UNKNOWN_RETRY',
      offer,
      inventory,
    );
  }
  if (offer === 'needs_confirmation') {
    return decision(
      'WAIT',
      'OFFER_NEEDS_CONFIRMATION',
      'AWAITING_SELLER_STEAM_GUARD',
      offer,
      inventory,
    );
  }
  if (offer === 'declined' || offer === 'expired') {
    if (inventory === 'confirmed') {
      return decision(
        'DISPUTE',
        'DELIVERY_SIGNAL_CONFLICT',
        'DELIVERY_SIGNAL_CONFLICT',
        offer,
        inventory,
        'FAILED_DISPUTE',
      );
    }
    const reason = offer === 'declined' ? 'OFFER_DECLINED' : 'OFFER_EXPIRED';
    return decision(
      'FAIL',
      reason,
      reason,
      offer,
      inventory,
      s.failMode === 'SAFE' ? 'FAILED_SAFE' : 'FAILED_DISPUTE',
    );
  }
  if (offer === 'accepted' && inventory === 'seller_still_holds') {
    return decision(
      'DISPUTE',
      'DELIVERY_INVENTORY_MISMATCH',
      'DELIVERY_INVENTORY_MISMATCH',
      offer,
      inventory,
      'FAILED_DISPUTE',
    );
  }
  if (offer === 'pending' && inventory === 'confirmed') {
    return decision(
      'DISPUTE',
      'DELIVERY_SIGNAL_CONFLICT',
      'DELIVERY_SIGNAL_CONFLICT',
      offer,
      inventory,
      'FAILED_DISPUTE',
    );
  }
  if (
    inventory === 'unknown' &&
    (s.inventoryUnknownStreak ?? 0) >= getInventoryUnknownMaxChecks()
  ) {
    return decision(
      'MANUAL_REVIEW',
      'INVENTORY_UNKNOWN_EXHAUSTED',
      'INVENTORY_UNKNOWN_EXHAUSTED',
      offer,
      inventory,
      'FAILED_DISPUTE',
    );
  }
  if (offer === 'accepted') {
    if (
      (s.acceptedPendingStreak ?? 0) >= getAcceptedInventoryPendingMaxChecks()
    ) {
      return decision(
        'MANUAL_REVIEW',
        'DELIVERY_VERIFICATION_UNKNOWN',
        'DELIVERY_VERIFICATION_UNKNOWN',
        offer,
        inventory,
        'FAILED_DISPUTE',
      );
    }
    return decision(
      'WAIT',
      'INVENTORY_PENDING',
      'INVENTORY_PENDING',
      offer,
      inventory,
    );
  }
  if (
    (offer === 'unknown' || offer === null) &&
    (s.offerUnknownStreak ?? 0) >= getOfferUnknownMaxChecks()
  ) {
    return decision(
      'MANUAL_REVIEW',
      'OFFER_UNKNOWN',
      'OFFER_UNKNOWN_EXHAUSTED',
      offer,
      inventory,
      'FAILED_DISPUTE',
    );
  }
  if (inventory === 'seller_still_holds' && !s.buyerAckReceived) {
    return decision(
      'WAIT',
      'OFFER_PENDING',
      'AWAITING_BUYER_STEAM_ACCEPT',
      offer,
      inventory,
    );
  }
  return decision(
    'WAIT',
    'OFFER_UNKNOWN',
    'OFFER_UNKNOWN_RETRY',
    offer,
    inventory,
  );
}

function decision(
  action: DeliveryVerificationDecision['action'],
  reason: DeliveryVerificationDecision['reason'],
  reasonCode: string,
  offerStatus: DeliveryVerificationDecision['offerStatus'],
  inventoryDelta: DeliveryVerificationDecision['inventoryDelta'],
  pollOutcome?: string,
): DeliveryVerificationDecision {
  return {
    action,
    reason,
    reasonCode,
    pollOutcome:
      action === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : (pollOutcome ?? action),
    offerStatus,
    inventoryDelta,
  };
}
