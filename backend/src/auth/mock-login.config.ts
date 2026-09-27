import { getProvidersConfig } from '../providers/config';

/** Shared by the auth endpoint and its public capability description. */
export function isMockLoginAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const config = getProvidersConfig();
  if (
    config.payment !== 'mock' &&
    process.env.PAYMENT_PROVIDER !== 'e2e_crypto'
  )
    return false;
  if (config.auth !== 'steam') return true;
  // Steam environments require an explicit opt-in even with mock payments.
  return (
    config.payment === 'mock' &&
    process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE === 'true'
  );
}
