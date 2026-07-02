/** USDT TRC-20 has 6 decimals; platform uses USD cents (2 decimals). 1 USDT = 1 USD. */
export const SUN_PER_USDT = 1_000_000n;
export const SUN_PER_USD_MINOR = 10_000n;

export function sunToUsdMinor(amountSun: bigint): bigint {
  if (amountSun < 0n) {
    throw new Error('amountSun must be non-negative');
  }
  return amountSun / SUN_PER_USD_MINOR;
}

export function usdMinorToSun(amountMinor: bigint): bigint {
  if (amountMinor < 0n) {
    throw new Error('amountMinor must be non-negative');
  }
  return amountMinor * SUN_PER_USD_MINOR;
}

export function parseSun(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error('Invalid sun amount');
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error('Invalid sun amount string');
  }
  return BigInt(value);
}

export function formatUsdtFromSun(amountSun: bigint): string {
  const whole = amountSun / SUN_PER_USDT;
  const fraction = amountSun % SUN_PER_USDT;
  const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}
