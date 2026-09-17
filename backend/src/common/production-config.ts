/**
 * Hard fail-closed gates for NODE_ENV=production.
 * Mock money / test surfaces must never be reachable in production.
 */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET.length < 32 ||
    env.JWT_SECRET === 'dev-jwt-secret'
  )
    throw new Error('Production requires a strong JWT_SECRET');
  if (env.AUTH_PROVIDER !== 'steam')
    throw new Error('Production requires AUTH_PROVIDER=steam');
  for (const name of [
    'ENABLE_TEST_ROUTES',
    'ENABLE_MOCK_DEPOSIT',
    'ALLOW_MOCK_LOGIN_IN_STEAM_MODE',
    'ENABLE_MOCK_TRADE',
  ]) {
    if (env[name] === 'true')
      throw new Error(`${name} is forbidden in production`);
  }
}

/**
 * Soft safety for money staging: real payment providers must not leave mock
 * trade / deposit / test routes enabled.
 */
export function assertMoneyStagingSafety(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const warnings: string[] = [];
  const payment = (env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
  const livePayments = payment === 'crypto_tron' || payment === 'north';
  if (!livePayments) {
    return warnings;
  }

  if (env.ENABLE_MOCK_TRADE === 'true') {
    warnings.push(
      'ENABLE_MOCK_TRADE=true while PAYMENT_PROVIDER is live — disable mock trade on money staging',
    );
  }
  if (env.ENABLE_MOCK_DEPOSIT === 'true') {
    warnings.push(
      'ENABLE_MOCK_DEPOSIT=true while PAYMENT_PROVIDER is live — disable mock deposit on money staging',
    );
  }
  if (env.ENABLE_TEST_ROUTES === 'true') {
    throw new Error(
      'ENABLE_TEST_ROUTES=true while PAYMENT_PROVIDER is live — refuse to boot money staging with wipe routes',
    );
  }
  return warnings;
}
