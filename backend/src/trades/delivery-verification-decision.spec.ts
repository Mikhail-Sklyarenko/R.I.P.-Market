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
    buyerAckReceived: false,
    timedOut: false,
    rateLimited: false,
    checkCount: 1,
    failMode: 'DISPUTE',
    ...overrides,
  };
}

describe('decideDeliveryVerification', () => {
  it('escalates prolonged Steam unavailability without refunding a sent item', () => {
    const result = decideDeliveryVerification(
      baseSignals({ rateLimited: true, timedOut: true, failMode: 'SAFE' }),
    );
    expect(result.action).toBe('MANUAL_REVIEW');
    expect(result.reasonCode).toBe('STEAM_UNAVAILABLE_TIMEOUT');
  });
  it.each(['pending', 'confirmed', 'seller_still_holds'] as const)(
    'escalates exhausted unknown offers with %s inventory without releasing funds',
    (inventoryDelta) => {
      const result = decideDeliveryVerification(
        baseSignals({
          offerStatus: 'unknown',
          inventoryDelta,
          checkCount: 200,
          offerUnknownStreak: 20,
          buyerAckReceived: true,
          failMode: 'SAFE',
        }),
      );
      expect(result.action).toBe('MANUAL_REVIEW');
      expect(result.reason).toBe('OFFER_UNKNOWN');
      expect(result.reasonCode).toBe('OFFER_UNKNOWN_EXHAUSTED');
      expect(result.pollOutcome).toBe('MANUAL_REVIEW');
    },
  );

  it('keeps retrying unknown offers before exhaustion', () => {
    const result = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'unknown',
        checkCount: 200,
        offerUnknownStreak: 19,
        buyerAckReceived: true,
      }),
    );
    expect(result.action).toBe('WAIT');
  });

  it('does not confirm accepted plus inventory without a durable receipt', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'confirmed',
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reason).toBe('INVENTORY_PENDING');
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
        checkCount: 200,
        acceptedPendingStreak: 5,
      }),
    );
    expect(decision.action).toBe('MANUAL_REVIEW');
    expect(decision.reason).toBe('DELIVERY_VERIFICATION_UNKNOWN');
    delete process.env.DELIVERY_ACCEPTED_INVENTORY_PENDING_MAX_CHECKS;
  });

  it('waits when offer accepted but inventory sync is unknown', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'unknown',
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reason).toBe('INVENTORY_PENDING');
  });

  it('waits when inventory confirmed but offer status unknown', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'unknown',
        inventoryDelta: 'confirmed',
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reason).toBe('OFFER_UNKNOWN');
  });

  it('waits when offer still needs Steam Guard confirmation', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'needs_confirmation',
        inventoryDelta: 'pending',
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reason).toBe('OFFER_NEEDS_CONFIRMATION');
    expect(decision.reasonCode).toBe('AWAITING_SELLER_STEAM_GUARD');
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
    expect(decision.action).toBe('MANUAL_REVIEW');
  });

  it('disputes contradictory signals despite buyer receipt', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'pending',
        inventoryDelta: 'confirmed',
        buyerAckReceived: true,
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    expect(decision.reasonCode).toBe('DELIVERY_SIGNAL_CONFLICT');
  });

  it('waits despite buyer receipt while seller holds the item', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'pending',
        inventoryDelta: 'seller_still_holds',
        buyerAckReceived: true,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('OFFER_UNKNOWN_RETRY');
  });

  it('waits for Steam accept when seller still holds and buyer has not acked', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'unknown',
        inventoryDelta: 'seller_still_holds',
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('AWAITING_BUYER_STEAM_ACCEPT');
  });

  it('waits despite buyer receipt when offer API is blind', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'unknown',
        inventoryDelta: 'pending',
        buyerAckReceived: true,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('OFFER_UNKNOWN_RETRY');
  });

  it('does not dispute inventory-unknown flaps when no offer was ever sent', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        hasOfferId: false,
        offerStatus: null,
        inventoryDelta: 'unknown',
        checkCount: 50,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('INVENTORY_UNKNOWN_RETRY');
  });

  it('disputes inventory-unknown exhaustion only after an offer id exists', () => {
    process.env.DELIVERY_INVENTORY_UNKNOWN_MAX_CHECKS = '10';
    const decision = decideDeliveryVerification(
      baseSignals({
        hasOfferId: true,
        offerStatus: null,
        inventoryDelta: 'unknown',
        checkCount: 200,
        inventoryUnknownStreak: 10,
      }),
    );
    expect(decision.action).toBe('MANUAL_REVIEW');
    expect(decision.reasonCode).toBe('INVENTORY_UNKNOWN_EXHAUSTED');
    delete process.env.DELIVERY_INVENTORY_UNKNOWN_MAX_CHECKS;
  });

  it('legacy mode waits despite buyer receipt and inventory lag', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        engineEnabled: false,
        offerStatus: 'pending',
        inventoryDelta: 'seller_still_holds',
        buyerAckReceived: true,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('OFFER_UNKNOWN_RETRY');
  });

  it('legacy mode disputes contradictory offer and inventory', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        engineEnabled: false,
        offerStatus: 'pending',
        inventoryDelta: 'confirmed',
        buyerAckReceived: true,
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    expect(decision.reasonCode).toBe('DELIVERY_SIGNAL_CONFLICT');
  });

  it('waits despite buyer receipt when inventory is pending', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        offerStatus: 'accepted',
        inventoryDelta: 'pending',
        buyerAckReceived: true,
        checkCount: 1,
      }),
    );
    expect(decision.action).toBe('WAIT');
    expect(decision.reasonCode).toBe('INVENTORY_PENDING');
  });

  it('disputes inventory mismatch even when engine disabled', () => {
    const decision = decideDeliveryVerification(
      baseSignals({
        engineEnabled: false,
        offerStatus: 'accepted',
        inventoryDelta: 'seller_still_holds',
      }),
    );
    expect(decision.action).toBe('DISPUTE');
    expect(decision.reason).toBe('DELIVERY_INVENTORY_MISMATCH');
  });
});

it('bounds a rate-limited pre-offer workflow instead of retrying forever', () => {
  const result = decideDeliveryVerification(
    baseSignals({ hasOfferId: false, rateLimited: true, timedOut: true }),
  );
  expect(result.action).toBe('MANUAL_REVIEW');
  expect(result.pollOutcome).toBe('MANUAL_REVIEW');
});

it.each(['pending', 'unknown', null] as const)(
  'durable receipt with %s inventory survives unknown/timeout and enters hold',
  (inventoryDelta) => {
    const result = decideDeliveryVerification(
      baseSignals({
        receiptProofPersisted: true,
        offerStatus: 'unknown',
        inventoryDelta,
        timedOut: true,
        checkCount: 100,
        offerUnknownStreak: 100,
      }),
    );
    expect(result.action).toBe('CONFIRM');
    expect(result.reason).toBe('RECEIPT_AUTHORITY_CONFIRMED');
  },
);
it('19 accepted checks then one unknown does not exhaust', () => {
  expect(
    decideDeliveryVerification(
      baseSignals({
        offerStatus: 'unknown',
        checkCount: 20,
        offerUnknownStreak: 1,
      }),
    ).action,
  ).toBe('WAIT');
});
