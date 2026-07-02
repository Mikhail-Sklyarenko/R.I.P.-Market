export type ProviderKind = 'mock' | 'steam';
export type PaymentProviderKind = 'mock' | 'crypto_tron';

export type ProvidersConfig = {
  auth: ProviderKind;
  inventory: ProviderKind;
  trade: ProviderKind;
  payment: PaymentProviderKind;
};

export function getProvidersConfig(): ProvidersConfig {
  return {
    auth: parseProviderKind(process.env.AUTH_PROVIDER, 'mock'),
    inventory: parseProviderKind(process.env.INVENTORY_PROVIDER, 'mock'),
    trade: parseProviderKind(process.env.TRADE_PROVIDER, 'mock'),
    payment:
      process.env.PAYMENT_PROVIDER === 'crypto_tron' ? 'crypto_tron' : 'mock',
  };
}

function parseProviderKind(
  value: string | undefined,
  fallback: ProviderKind,
): ProviderKind {
  if (value === 'steam') {
    return 'steam';
  }
  return fallback;
}
