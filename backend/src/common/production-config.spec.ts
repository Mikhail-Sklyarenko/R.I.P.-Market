import {
  assertMoneyStagingSafety,
  assertProductionConfig,
} from './production-config';

describe('production-config', () => {
  it('allows non-production without checks', () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('rejects mock deposit/trade flags in production', () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        AUTH_PROVIDER: 'steam',
        ENABLE_MOCK_DEPOSIT: 'true',
      } as NodeJS.ProcessEnv),
    ).toThrow(/ENABLE_MOCK_DEPOSIT/);
  });

  it('warns when live payments keep mock trade enabled', () => {
    const warnings = assertMoneyStagingSafety({
      PAYMENT_PROVIDER: 'crypto_tron',
      ENABLE_MOCK_TRADE: 'true',
      ENABLE_MOCK_DEPOSIT: 'false',
    } as NodeJS.ProcessEnv);
    expect(warnings.some((w) => w.includes('ENABLE_MOCK_TRADE'))).toBe(true);
  });
});
