import {
  getAutoSettlementMaxExposureMinor,
  getAutoSettlementMaxOrderMinor,
  isSettlementOpenRollout,
} from './settlement.config';
describe('explicit risk budget configuration', () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });
  it.each([undefined, '', '-1', '1.5', 'bad', ' 10 '])(
    'disables malformed/missing budget %s',
    (value) => {
      if (value === undefined) {
        delete process.env.AUTO_SETTLEMENT_MAX_ORDER_MINOR;
        delete process.env.AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR;
      } else {
        process.env.AUTO_SETTLEMENT_MAX_ORDER_MINOR = value;
        process.env.AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR = value;
      }
      expect(getAutoSettlementMaxOrderMinor()).toBe(0n);
      expect(getAutoSettlementMaxExposureMinor()).toBe(0n);
    },
  );
  it('accepts explicit integer amounts without a currency default', () => {
    process.env.AUTO_SETTLEMENT_MAX_ORDER_MINOR = '3';
    process.env.AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR = '100';
    expect(getAutoSettlementMaxOrderMinor()).toBe(3n);
    expect(getAutoSettlementMaxExposureMinor()).toBe(100n);
  });
  it('opens only by explicit mode', () => {
    delete process.env.SETTLEMENT_ROLLOUT_MODE;
    expect(isSettlementOpenRollout()).toBe(false);
    process.env.SETTLEMENT_ROLLOUT_MODE = 'open';
    expect(isSettlementOpenRollout()).toBe(true);
  });
});
