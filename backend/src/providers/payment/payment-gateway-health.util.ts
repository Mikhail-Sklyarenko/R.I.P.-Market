import { getPaymentConfig, isLivePaymentProvider } from './payment.config';

export type CryptoGatewayHealth = {
  status: 'ok' | 'unavailable' | 'disabled';
  latencyMs?: number;
};

const HEALTH_TIMEOUT_MS = 5_000;

async function probe(url: string): Promise<boolean> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  return response.ok;
}

/**
 * Own crypto-gateway: GET /v1/health
 * NORTH: prefer /v1/health, fallback GET /v1/integration (public contract)
 */
export async function checkCryptoGatewayHealth(): Promise<CryptoGatewayHealth> {
  if (!isLivePaymentProvider()) {
    return { status: 'disabled' };
  }

  const config = getPaymentConfig();
  if (!config.gatewayUrl || !config.gatewayApiKey) {
    return { status: 'unavailable' };
  }

  const base = config.gatewayUrl.replace(/\/$/, '');
  const startedAt = Date.now();
  const paths =
    config.provider === 'north'
      ? ['/v1/health', '/v1/integration']
      : ['/v1/health'];

  try {
    for (const path of paths) {
      try {
        if (await probe(`${base}${path}`)) {
          return {
            status: 'ok',
            latencyMs: Date.now() - startedAt,
          };
        }
      } catch {
        // try next path
      }
    }
    return {
      status: 'unavailable',
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: 'unavailable',
      latencyMs: Date.now() - startedAt,
    };
  }
}
