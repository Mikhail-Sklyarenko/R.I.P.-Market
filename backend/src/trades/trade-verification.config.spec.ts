import {
  assertShadowModeConfig,
  getTradeVerificationMode,
  isLiveVerificationMode,
  isShadowVerificationMode,
  resolveOrderVerificationMode,
} from './trade-verification.config';

describe('trade-verification.config', () => {
  const envBackup = process.env;

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('maps legacy STEAM_POLL to live', () => {
    process.env.TRADE_VERIFICATION_MODE = 'STEAM_POLL';
    expect(getTradeVerificationMode()).toBe('live');
    expect(isLiveVerificationMode()).toBe(true);
    expect(resolveOrderVerificationMode()).toBe('STEAM_POLL');
  });

  it('resolves shadow mode for orders', () => {
    process.env.TRADE_VERIFICATION_MODE = 'shadow';
    expect(isShadowVerificationMode()).toBe(true);
    expect(resolveOrderVerificationMode()).toBe('SHADOW');
  });

  it('rejects real settlement in shadow mode', () => {
    process.env.TRADE_VERIFICATION_MODE = 'shadow';
    process.env.ENABLE_REAL_SETTLEMENT = 'true';
    expect(() => assertShadowModeConfig()).toThrow(
      'ENABLE_REAL_SETTLEMENT must be false when TRADE_VERIFICATION_MODE=shadow',
    );
  });

  it('allows shadow mode when real settlement is disabled', () => {
    process.env.TRADE_VERIFICATION_MODE = 'shadow';
    process.env.ENABLE_REAL_SETTLEMENT = 'false';
    expect(() => assertShadowModeConfig()).not.toThrow();
  });
});
