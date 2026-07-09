import {
  getSettlementHoldDays,
  getSettlementHoldMs,
  isSettlementHoldWindowEnabled,
  settlementHoldReleaseIdempotencyKey,
} from './settlement-hold.config';

describe('settlement-hold.config', () => {
  it('defaults hold window to 8 days', () => {
    delete process.env.SETTLEMENT_HOLD_DAYS;
    expect(getSettlementHoldDays()).toBe(8);
    expect(getSettlementHoldMs()).toBe(8 * 24 * 60 * 60 * 1000);
  });

  it('uses stable release idempotency key', () => {
    expect(settlementHoldReleaseIdempotencyKey('order-1')).toBe(
      'settlement-release:order-1',
    );
  });

  it('is disabled unless feature flag is true', () => {
    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
    expect(isSettlementHoldWindowEnabled()).toBe(false);
    process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'true';
    expect(isSettlementHoldWindowEnabled()).toBe(true);
  });
});
