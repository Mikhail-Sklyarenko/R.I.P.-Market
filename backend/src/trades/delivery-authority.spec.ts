import { decideDeliveryVerification } from './delivery-verification-decision';
import type { DeliveryVerificationSignals } from './delivery-verification.types';

describe('authoritative delivery gate', () => {
  for (const engineEnabled of [true, false]) {
    for (const buyerAckReceived of [true, false]) {
      for (const offerStatus of [
        null,
        'pending',
        'unknown',
        'accepted',
        'declined',
        'expired',
        'needs_confirmation',
      ] as const) {
        for (const inventoryDelta of [
          null,
          'unknown',
          'pending',
          'seller_still_holds',
          'confirmed',
        ] as const) {
          it(`engine=${engineEnabled}, receipt=${buyerAckReceived}, offer=${offerStatus}, inventory=${inventoryDelta}`, () => {
            const signals: DeliveryVerificationSignals = {
              engineEnabled,
              buyerAckReceived,
              offerStatus,
              inventoryDelta,
              hasOfferId: offerStatus !== null,
              shadowMode: false,
              timedOut: false,
              rateLimited: false,
              checkCount: 100,
              failMode: 'DISPUTE',
            };
            const action = decideDeliveryVerification(signals).action;
            expect(action === 'CONFIRM').toBe(
              offerStatus === 'accepted' && inventoryDelta === 'confirmed',
            );
          });
        }
      }
    }
  }
});
