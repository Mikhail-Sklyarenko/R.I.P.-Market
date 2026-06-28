export function isRealSettlementEnabled(): boolean {
  return process.env.ENABLE_REAL_SETTLEMENT === 'true';
}

export function getEnvAllowlistSteamIds(): Set<string> {
  const raw = process.env.STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function getMaxOrderMinor(): bigint {
  return parseLimitMinor(process.env.STEAM_SETTLEMENT_MAX_ORDER_MINOR, 50_000n);
}

export function getMaxDailyOrders(): number {
  const value = Number(process.env.STEAM_SETTLEMENT_MAX_DAILY_ORDERS ?? 3);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

export function getMaxDailyVolumeMinor(): bigint {
  return parseLimitMinor(
    process.env.STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR,
    150_000n,
  );
}

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function parseLimitMinor(raw: string | undefined, fallback: bigint): bigint {
  if (!raw) {
    return fallback;
  }
  try {
    const value = BigInt(raw);
    return value > 0n ? value : fallback;
  } catch {
    return fallback;
  }
}
