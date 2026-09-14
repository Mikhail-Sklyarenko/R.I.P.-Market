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
