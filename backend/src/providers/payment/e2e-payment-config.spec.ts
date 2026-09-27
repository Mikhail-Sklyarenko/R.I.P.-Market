import { parsePaymentProviderKind } from './payment.config';
import { assertMoneyStagingSafety } from '../../common/production-config';

describe('isolated Playwright payment environment', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {
      ...original,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      ENABLE_TEST_ROUTES: 'true',
      PAYMENT_PROVIDER: 'e2e_crypto',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:55432/p2pcs_e2e',
    };
  });
  afterEach(() => {
    process.env = original;
  });
  it('selects crypto API contracts only in the disposable loopback harness', () => {
    expect(parsePaymentProviderKind('e2e_crypto')).toBe('crypto_tron');
    expect(() => assertMoneyStagingSafety()).not.toThrow();
  });
  it.each([
    ['NODE_ENV', 'production'],
    ['NODE_ENV', 'development'],
    ['HOST', '0.0.0.0'],
    ['ENABLE_TEST_ROUTES', 'false'],
    ['DATABASE_URL', 'postgresql://test:test@remote/p2pcs_e2e'],
    ['DATABASE_URL', 'postgresql://test:test@127.0.0.1/production'],
  ])('refuses unsafe %s=%s', (key, value) => {
    process.env[key] = value;
    expect(() => parsePaymentProviderKind('e2e_crypto')).toThrow(/e2e_crypto/);
  });
  it('keeps destructive helpers forbidden with real payment provider names', () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    expect(() => assertMoneyStagingSafety()).toThrow(/refuse to boot/);
  });
});
