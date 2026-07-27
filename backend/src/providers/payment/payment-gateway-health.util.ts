import { getPaymentConfig, isCryptoPaymentProvider } from './payment.config';

export type CryptoGatewayHealth = {
  status: 'ok' | 'unavailable' | 'disabled';
  latencyMs?: number;
};

const HEALTH_TIMEOUT_MS = 5_000;

export async function checkCryptoGatewayHealth(): Promise<CryptoGatewayHealth> {
  if (!isCryptoPaymentProvider()) {
    return { status: 'disabled' };
  }

  const config = getPaymentConfig();
  if (!config.gatewayUrl || !config.gatewayApiKey) {
    return { status: 'unavailable' };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.gatewayUrl}/v1/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return {
      status: response.ok ? 'ok' : 'unavailable',
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: 'unavailable',
      latencyMs: Date.now() - startedAt,
    };
  }
}
