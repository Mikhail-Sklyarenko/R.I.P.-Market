import {
  isSellerManualFallbackNeeded,
  isTradeTaskDeliveryCheck,
} from './trade-task-manual-fallback.util';

describe('trade-task-manual-fallback.util', () => {
  it('detects delivery check for ITEM_ALREADY_GONE', () => {
    expect(
      isTradeTaskDeliveryCheck({
        status: 'FAILED',
        lastErrorCode: 'ITEM_ALREADY_GONE',
      }),
    ).toBe(true);
  });

  it('requires manual send after OFFER_FAILED', () => {
    expect(
      isSellerManualFallbackNeeded({
        orderStatus: 'WAITING_TRADE',
        externalOfferId: null,
        task: {
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'OFFER_SEND_FAILED',
          attemptCount: 2,
          maxAttempts: 5,
        },
      }),
    ).toBe(true);
  });

  it('keeps auto path while task is healthy', () => {
    expect(
      isSellerManualFallbackNeeded({
        orderStatus: 'WAITING_TRADE',
        externalOfferId: null,
        task: {
          status: 'IN_PROGRESS',
          executionPhase: 'OFFER_DRAFTED',
          lastErrorCode: null,
          attemptCount: 0,
          maxAttempts: 5,
        },
      }),
    ).toBe(false);
  });
});
