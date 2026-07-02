import { createHmac, timingSafeEqual } from 'node:crypto';

export const SUN_PER_USD_MINOR = 10_000n;

export function sunToUsdMinor(amountSun: bigint): bigint {
  return amountSun / SUN_PER_USD_MINOR;
}

export function usdMinorToSun(amountMinor: bigint): bigint {
  return amountMinor * SUN_PER_USD_MINOR;
}

export function isValidTronAddress(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

export function verifyGatewayWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!secret || !signature) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.trim().toLowerCase();
  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function signGatewayWebhook(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
