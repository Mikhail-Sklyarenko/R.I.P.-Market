import { createHmac, timingSafeEqual } from 'node:crypto';

export const SUN_PER_USD_MINOR = 10_000n;

export function sunToUsdMinor(amountSun: bigint): bigint {
  return amountSun / SUN_PER_USD_MINOR;
}

export function usdMinorToSun(amountMinor: bigint): bigint {
  return amountMinor * SUN_PER_USD_MINOR;
}

/** Ledger USD cents → decimal string for NORTH amountUsd (e.g. 1050 → "10.50"). */
export function usdMinorToDecimalString(amountMinor: number | bigint): string {
  const minor = BigInt(amountMinor);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body =
    frac === 0n
      ? whole.toString()
      : `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * NORTH creditUsd / amountUsd → ledger USD cents.
 * Uses half-up rounding to 2 decimal places.
 */
export function usdDecimalToMinor(usd: string): bigint {
  const trimmed = String(usd ?? '').trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid USD amount: ${usd}`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ''] = unsigned.split('.');
  const whole = BigInt(wholePart || '0');
  const padded = (fracPart + '00').slice(0, 3);
  const centsRaw = Number(padded.slice(0, 2));
  const tenths = Number(padded.slice(2, 3) || '0');
  let cents = centsRaw + (tenths >= 5 ? 1 : 0);
  let wholeAdj = whole;
  if (cents >= 100) {
    wholeAdj += 1n;
    cents -= 100;
  }
  const minor = wholeAdj * 100n + BigInt(cents);
  return negative ? -minor : minor;
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
  const provided = signature
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function signGatewayWebhook(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
