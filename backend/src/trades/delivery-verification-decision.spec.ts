import { decideDeliveryVerification } from './delivery-verification-decision';
import type { DeliveryVerificationSignals } from './delivery-verification.types';

function baseSignals(
  overrides: Partial<DeliveryVerificationSignals> = {},
): DeliveryVerificationSignals {
  return {
    engineEnabled: true,
    shadowMode: false,
    hasOfferId: true,
    offerStatus: 'pending',
    inventoryDelta: 'pending',
    timedOut: false,
    rateLimited: false,
    checkCount: 1,
    failMode: 'DISPUTE',
    ...overrides,
  };
}

describe('decideDeliveryVerification', () => {
  it('confirms when offer accepted and inventory delta ok', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'confirmed',
      }),
    );
    expect(decision.action).toBe('CONFIRM');
    expect(decision.reason).toBe('DUAL_SIGNAL_CONFIRMED');
  });

  it('disputes when offer accepted but inventory mismatch', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'seller_still_holds',
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    expect(decision.reasonCode).toBe('DELIVERY_INVENTORY_MISMATCH');
  });

  it('disputes when inventory confirmed but offer still pending', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'pending',
        inventoryDelta: 'confirmed',
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    expect(decision.reasonCode).toBe('DELIVERY_SIGNAL_CONFLICT');
  });

  it('waits when offer accepted and inventory still pending', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'pending',
        checkCount: 3,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reason).toBe('INVENTORY_PENDING');
  });

  it('disputes when accepted+pending inventory checks are exhausted', () => {
    process.env.DELIVERY_ACCEPTED_INVENTORY_PENDING_MAX_CHECKS = '5';
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'pending',
        checkCount: 5,
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    delete process.env.DELIVERY_ACCEPTED_INVENTORY_PENDING_MAX_CHECKS;
  });

  it('backs off on rate limit without transition', () => {
    const decision = decideDeliveryVerification(
      baseSignals({ rateLimited: true }),
    );
    expect(decision.action).toBe('BACKOFF');
    expect(decision.reason).toBe('RATE_LIMITED');
  });

  it('times out when trade window elapsed', () => {
    const decision = decideDeliveryVerification(
      baseSignals({ timedOut: true }),
    );
    expect(decision.action).toBe('TIMEOUT');
  });

  it('keeps legacy offer-accepted confirm when engine disabled', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        engineEnabled: false,
        offerStatus: 'accepted',
        inventoryDelta: 'seller_still_holds',
      }),
    );
    expect(decision.action).toBe('CONFIRM');
    expect(decision.reason).toBe('LEGACY_OFFER_ACCEPTED');
  });
});
