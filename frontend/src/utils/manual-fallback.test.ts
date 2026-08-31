import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSellerManualFallbackNeeded } from './manual-fallback.ts';

describe('isSellerManualFallbackNeeded', () => {
  it('is false while auto-offer is still drafting', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'IN_PROGRESS',
          executionPhase: 'OFFER_DRAFTED',
          lastErrorCode: null,
          attemptCount: 1,
          maxAttempts: 5,
        },
      }),
      false,
    );
  });

  it('is true while waiting for Steam Guard confirm', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'DISPATCHED',
          executionPhase: 'CONFIRM_PENDING',
          lastErrorCode: 'CONFIRM_PENDING',
          attemptCount: 1,
          maxAttempts: 5,
        },
      }),
      true,
    );
  });

  it('is true when task says OFFER_SENT but offer id missing on order', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'ACKED',
          executionPhase: 'OFFER_SENT',
          lastErrorCode: null,
          attemptCount: 1,
          maxAttempts: 5,
        },
      }),
      true,
    );
  });

  it('is true after auto-offer fails', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'OFFER_SEND_FAILED',
          attemptCount: 3,
          maxAttempts: 5,
        },
      }),
      true,
    );
  });

  it('is true for trade hold without waiting for max attempts', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'IN_PROGRESS',
          executionPhase: 'OFFER_SUBMITTED',
          lastErrorCode: 'TRADE_HOLD_BLOCKED',
          attemptCount: 1,
          maxAttempts: 5,
        },
      }),
      true,
    );
  });

  it('is false once offer id is saved', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: '1234567890' },
        tradeTask: {
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'OFFER_SEND_FAILED',
        },
      }),
      false,
    );
  });

  it('is false for delivery-check (item already gone)', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: {
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'ITEM_ALREADY_GONE',
        },
      }),
      false,
    );
  });

  it('is true when there is no extension task', () => {
    assert.equal(
      isSellerManualFallbackNeeded({
        status: 'WAITING_TRADE',
        tradeOperation: { externalOfferId: null },
        tradeTask: null,
      }),
      true,
    );
  });
});
