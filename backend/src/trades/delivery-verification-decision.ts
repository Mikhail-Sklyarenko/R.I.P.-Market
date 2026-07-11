import type {
  DeliveryVerificationDecision,
  DeliveryVerificationSignals,
} from './delivery-verification.types';
import { getAcceptedInventoryPendingMaxChecks, getInventoryUnknownMaxChecks } from './delivery-verification.config';

/**
 * Delivery verification decision table (M6).
 *
 * | Offer        | Inventory           | Engine | Action  | Reason                         |
 * |--------------|---------------------|--------|---------|--------------------------------|
 * | (timeout)    | *                   | *      | TIMEOUT | TRADE_TIMEOUT                  |
 * | (rate limit) | *                   | *      | BACKOFF | RATE_LIMITED                   |
 * | accepted     | confirmed           | on     | CONFIRM | DUAL_SIGNAL_CONFIRMED          |
 * | accepted     | pending (exhausted checks) | **CONFIRM** | `OFFER_ACCEPTED_INVENTORY_LAG` |
 * | accepted     | seller_still_holds | **DISPUTE** | `DELIVERY_INVENTORY_MISMATCH` |
 * | accepted     | unknown             | on     | **CONFIRM** | `OFFER_ACCEPTED_INVENTORY_UNKNOWN` |
 * | pending      | confirmed           | on     | DISPUTE | DELIVERY_SIGNAL_CONFLICT       |
 * | pending      | pending/holds       | on     | WAIT    | OFFER_PENDING                  |
 * | pending      | unknown             | on     | WAIT    | INVENTORY_PENDING              |
 * | declined     | *                   | on     | FAIL    | OFFER_DECLINED                 |
 * | expired      | *                   | on     | FAIL    | OFFER_EXPIRED                  |
 * | unknown      | *                   | on     | DISPUTE | OFFER_UNKNOWN                  |
 * | (no offer)   | confirmed           | on     | CONFIRM | INVENTORY_ONLY_CONFIRMED       |
 * | (no offer)   | pending/holds       | on     | WAIT    | INVENTORY_PENDING              |
 * | (no offer)   | unknown (exhausted) | on     | DISPUTE | INVENTORY_UNKNOWN_EXHAUSTED    |
 * | accepted     | *                   | off    | CONFIRM | LEGACY_OFFER_ACCEPTED          |
 * | (no offer)   | confirmed           | off    | CONFIRM | LEGACY_INVENTORY_CONFIRMED     |
 *
 * * WAIT becomes CONFIRM when checkCount exceeds DELIVERY_ACCEPTED_INVENTORY_PENDING_MAX_CHECKS.
 */
export function decideDeliveryVerification(
  signals: DeliveryVerificationSignals,
): DeliveryVerificationDecision {
  if (signals.rateLimited) {
    return decision('BACKOFF', 'RATE_LIMITED', 'rate_limited', null, null);
  }

  if (signals.timedOut) {
    return decision('TIMEOUT', 'TRADE_TIMEOUT', 'TRADE_TIMEOUT', null, null);
  }

  if (!signals.engineEnabled) {
    return decideLegacy(signals);
  }

  if (signals.hasOfferId && signals.offerStatus !== null) {
    return decideDualSignal(signals);
  }

  return decideInventoryOnly(signals);
}

function decideLegacy(
  signals: DeliveryVerificationSignals,
): DeliveryVerificationDecision {
  if (signals.hasOfferId) {
    if (signals.offerStatus === 'accepted') {
      return decision(
        'CONFIRM',
        'LEGACY_OFFER_ACCEPTED',
        'LEGACY_OFFER_ACCEPTED',
        signals.offerStatus,
        signals.inventoryDelta,
        'CONFIRMED',
      );
    }
    if (
      signals.offerStatus === 'declined' ||
      signals.offerStatus === 'expired'
    ) {
      const reason =
        signals.offerStatus === 'declined'
          ? 'OFFER_DECLINED'
          : 'OFFER_EXPIRED';
      return decision(
        'FAIL',
        reason,
        reason,
        signals.offerStatus,
        signals.inventoryDelta,
        signals.failMode === 'SAFE' ? 'FAILED_SAFE' : 'FAILED_DISPUTE',
      );
    }
    if (signals.offerStatus === 'unknown') {
      if (signals.inventoryDelta === 'confirmed') {
        return decision(
          'CONFIRM',
          'LEGACY_INVENTORY_CONFIRMED',
          'LEGACY_INVENTORY_CONFIRMED',
          signals.offerStatus,
          signals.inventoryDelta,
          'CONFIRMED',
        );
      }
      return decision(
        'WAIT',
        'OFFER_PENDING',
        'OFFER_UNKNOWN_RETRY',
        signals.offerStatus,
        signals.inventoryDelta,
      );
    }
    return decision(
      'WAIT',
      'OFFER_PENDING',
      'OFFER_PENDING',
      signals.offerStatus,
      signals.inventoryDelta,
    );
  }

  if (signals.inventoryDelta === 'confirmed') {
    return decision(
      'CONFIRM',
      'LEGACY_INVENTORY_CONFIRMED',
      'LEGACY_INVENTORY_CONFIRMED',
      null,
      signals.inventoryDelta,
      'CONFIRMED',
    );
  }

  return decision(
    'WAIT',
    'INVENTORY_PENDING',
    'INVENTORY_PENDING',
    null,
    signals.inventoryDelta,
  );
}

function decideDualSignal(
  signals: DeliveryVerificationSignals,
): DeliveryVerificationDecision {
  const offer = signals.offerStatus!;
  const inventory = signals.inventoryDelta;

  if (offer === 'declined') {
    return decision(
      'FAIL',
      'OFFER_DECLINED',
      'OFFER_DECLINED',
      offer,
      inventory,
      signals.failMode === 'SAFE' ? 'FAILED_SAFE' : 'FAILED_DISPUTE',
    );
  }
  if (offer === 'expired') {
    return decision(
      'FAIL',
      'OFFER_EXPIRED',
      'OFFER_EXPIRED',
      offer,
      inventory,
      signals.failMode === 'SAFE' ? 'FAILED_SAFE' : 'FAILED_DISPUTE',
    );
  }
  if (offer === 'unknown') {
    if (inventory === 'confirmed') {
      return decision(
        'CONFIRM',
        'INVENTORY_CONFIRMED_OFFER_UNKNOWN',
        'INVENTORY_CONFIRMED_OFFER_UNKNOWN',
        offer,
        inventory,
        'CONFIRMED',
      );
    }
    if (inventory === 'pending' || inventory === 'seller_still_holds') {
      return decision(
        'WAIT',
        'OFFER_UNKNOWN',
        'OFFER_UNKNOWN_RETRY',
        offer,
        inventory,
      );
    }
    return decision(
      'DISPUTE',
      'OFFER_UNKNOWN',
      'OFFER_UNKNOWN',
      offer,
      inventory,
      'FAILED_DISPUTE',
    );
  }

  if (offer === 'accepted') {
    if (inventory === 'confirmed') {
      return decision(
        'CONFIRM',
        'DUAL_SIGNAL_CONFIRMED',
        'DUAL_SIGNAL_CONFIRMED',
        offer,
        inventory,
        'CONFIRMED',
      );
    }
    if (inventory === 'seller_still_holds') {
      return decision(
        'DISPUTE',
        'DELIVERY_INVENTORY_MISMATCH',
        'DELIVERY_INVENTORY_MISMATCH',
        offer,
        inventory,
        'FAILED_DISPUTE',
      );
    }
    if (inventory === 'unknown') {
      return decision(
        'CONFIRM',
        'OFFER_ACCEPTED_INVENTORY_UNKNOWN',
        'OFFER_ACCEPTED_INVENTORY_UNKNOWN',
        offer,
        inventory,
        'CONFIRMED',
      );
    }
    if (
      signals.checkCount >= getAcceptedInventoryPendingMaxChecks()
    ) {
      return decision(
        'CONFIRM',
        'OFFER_ACCEPTED_INVENTORY_LAG',
        'OFFER_ACCEPTED_INVENTORY_LAG',
        offer,
        inventory,
        'CONFIRMED',
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

  if (inventory === 'unknown') {
    return decision(
      'WAIT',
      'INVENTORY_PENDING',
      'INVENTORY_UNKNOWN_RETRY',
      offer,
      inventory,
    );
  }

  return decision(
    'WAIT',
    'OFFER_PENDING',
    'OFFER_PENDING',
    offer,
    inventory,
  );
}

function decideInventoryOnly(
  signals: DeliveryVerificationSignals,
): DeliveryVerificationDecision {
  const inventory = signals.inventoryDelta;

  if (inventory === 'confirmed') {
    return decision(
      'CONFIRM',
      'INVENTORY_ONLY_CONFIRMED',
      'INVENTORY_ONLY_CONFIRMED',
      null,
      inventory,
      'CONFIRMED',
    );
  }

  if (
    inventory === 'unknown' &&
    signals.checkCount >= getInventoryUnknownMaxChecks()
  ) {
    return decision(
      'DISPUTE',
      'INVENTORY_UNKNOWN_EXHAUSTED',
      'INVENTORY_UNKNOWN_EXHAUSTED',
      null,
      inventory,
      'FAILED_DISPUTE',
    );
  }

  return decision(
    'WAIT',
    'INVENTORY_PENDING',
    'INVENTORY_PENDING',
    null,
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
    pollOutcome: pollOutcome ?? action,
    offerStatus,
    inventoryDelta,
  };
}
