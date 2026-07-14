import {
  ExtensionOfferErrorCode,
  isOfferErrorRetryable,
  resolveOfferFailureReason,
  shouldTriggerDeliveryCheckAfterOfferFailure,
} from './extension-offer-error-codes';

describe('extension-offer-error-codes', () => {
  it('maps ITEM_MISSING after advanced trade phases to ITEM_ALREADY_GONE', () => {
    expect(resolveOfferFailureReason('ITEM_MISSING', 'CONFIRM_PENDING')).toBe(
      ExtensionOfferErrorCode.ITEM_ALREADY_GONE,
    );
    expect(resolveOfferFailureReason('ITEM_MISSING', 'ITEM_SELECTED')).toBe(
      ExtensionOfferErrorCode.ITEM_ALREADY_GONE,
    );
    expect(resolveOfferFailureReason('ITEM_MISSING', 'OFFER_SUBMITTED')).toBe(
      ExtensionOfferErrorCode.ITEM_ALREADY_GONE,
    );
  });

  it('keeps early ITEM_MISSING retryable for inventory sync lag', () => {
    expect(resolveOfferFailureReason('ITEM_MISSING', 'ACKED')).toBe(
      ExtensionOfferErrorCode.ITEM_MISSING,
    );
    expect(resolveOfferFailureReason('ITEM_MISSING', 'TRADE_PAGE_OPENED')).toBe(
      ExtensionOfferErrorCode.ITEM_MISSING,
    );
    expect(isOfferErrorRetryable('ITEM_MISSING', 'ACKED')).toBe(true);
  });

  it('does not retry ITEM_ALREADY_GONE', () => {
    expect(isOfferErrorRetryable('ITEM_MISSING', 'CONFIRM_PENDING')).toBe(false);
    expect(isOfferErrorRetryable('ITEM_ALREADY_GONE', null)).toBe(false);
  });

  it('triggers delivery check for gone/missing item failures', () => {
    expect(shouldTriggerDeliveryCheckAfterOfferFailure('ITEM_ALREADY_GONE')).toBe(
      true,
    );
    expect(shouldTriggerDeliveryCheckAfterOfferFailure('ITEM_MISSING')).toBe(true);
    expect(shouldTriggerDeliveryCheckAfterOfferFailure('STEAM_UNAVAILABLE')).toBe(
      false,
    );
  });
});
