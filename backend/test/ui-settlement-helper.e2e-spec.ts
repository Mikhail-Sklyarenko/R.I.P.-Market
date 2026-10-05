import { createRequire } from 'node:module';

const { assertTestContext } = createRequire(__filename)(
  './helpers/complete-ui-order.cjs',
) as {
  assertTestContext: (env: Record<string, string>, orderId: string) => void;
};

describe('Local UI proof fixture safety', () => {
  const orderId = '668efbd1-0d6f-4443-ae1e-238d835ab259';
  const env = {
    NODE_ENV: 'test',
    ENABLE_TEST_ROUTES: 'true',
    AUTH_PROVIDER: 'mock',
    INVENTORY_PROVIDER: 'mock',
    TRADE_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'mock',
    DATABASE_URL: 'postgresql://cs2:cs2@127.0.0.1:5432/p2pcs_e2e',
  };
  it('accepts only the explicit disposable test context', () => {
    expect(() => assertTestContext(env, orderId)).not.toThrow();
  });
  it.each([
    ['ENABLE_TEST_ROUTES', 'false'],
    ['ENABLE_TEST_ROUTES', ''],
    ['NODE_ENV', 'production'],
    ['AUTH_PROVIDER', 'steam'],
    ['INVENTORY_PROVIDER', 'steam'],
    ['TRADE_PROVIDER', 'steam'],
    ['PAYMENT_PROVIDER', 'crypto_tron'],
    ['PAYMENT_PROVIDER', 'north'],
    ['DATABASE_URL', 'postgresql://cs2:cs2@remote.test:5432/p2pcs_e2e'],
    ['DATABASE_URL', 'postgresql://cs2:cs2@localhost:5432/production'],
  ])('rejects %s=%s before loading the application', (key, value) => {
    expect(() =>
      assertTestContext({ ...env, [key]: value }, orderId),
    ).toThrow();
  });
  it('rejects arbitrary order identifiers', () => {
    expect(() => assertTestContext(env, '../other')).toThrow();
  });
});
