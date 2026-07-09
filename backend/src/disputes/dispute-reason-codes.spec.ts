import {
  DISPUTE_REASON_REGISTRY,
  mapExtensionErrorToDisputeReason,
  shouldAutoOpenDispute,
} from './dispute-reason-codes';

describe('dispute-reason-codes', () => {
  it('contains unified codes from M5/M6/M3', () => {
    const codes = DISPUTE_REASON_REGISTRY.map((entry) => entry.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'TRADE_REFERENCE_SPOOF',
        'DELIVERY_INVENTORY_MISMATCH',
        'EXT_ITEM_MISMATCH',
        'TRADE_TIMEOUT',
      ]),
    );
  });

  it('maps extension errors to dispute reason codes', () => {
    expect(mapExtensionErrorToDisputeReason('ITEM_MISMATCH')).toBe(
      'EXT_ITEM_MISMATCH',
    );
    expect(mapExtensionErrorToDisputeReason('MAX_ATTEMPTS_REACHED')).toBe(
      'EXT_MAX_ATTEMPTS_REACHED',
    );
    expect(mapExtensionErrorToDisputeReason('OFFER_SEND_FAILED')).toBeNull();
  });

  it('marks auto dispute codes', () => {
    expect(shouldAutoOpenDispute('TRADE_REFERENCE_SPOOF')).toBe(true);
    expect(shouldAutoOpenDispute('EXT_MAX_ATTEMPTS_REACHED')).toBe(false);
  });
});
