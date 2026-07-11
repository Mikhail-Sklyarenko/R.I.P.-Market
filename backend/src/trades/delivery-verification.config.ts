export function isDeliveryVerificationEngineEnabled(): boolean {
  return process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE === 'true';
}

export function getTradeTimeoutMs(): number {
  const minutes = Number(process.env.TRADE_TIMEOUT_MINUTES ?? 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 3_600_000;
}

export function getPollBackoffBaseMs(): number {
  const value = Number(process.env.TRADE_POLL_BACKOFF_MS ?? 60_000);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

export function getPollBackoffMaxMs(): number {
  const value = Number(process.env.TRADE_POLL_BACKOFF_MAX_MS ?? 900_000);
  return Number.isFinite(value) && value > 0 ? value : 900_000;
}

export function getPollBackoffMultiplier(): number {
  const value = Number(process.env.TRADE_POLL_BACKOFF_MULTIPLIER ?? 2);
  return Number.isFinite(value) && value >= 1 ? value : 2;
}

export function getInventoryUnknownMaxChecks(): number {
  const value = Number(process.env.DELIVERY_INVENTORY_UNKNOWN_MAX_CHECKS ?? 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export function getAcceptedInventoryPendingMaxChecks(): number {
  const value = Number(
    process.env.DELIVERY_ACCEPTED_INVENTORY_PENDING_MAX_CHECKS ?? 20,
  );
  return Number.isFinite(value) && value > 0 ? value : 20;
}

export function getTradeFailMode(): 'SAFE' | 'DISPUTE' {
  return process.env.TRADE_FAIL_MODE === 'SAFE' ? 'SAFE' : 'DISPUTE';
}

export function computeRateLimitBackoffMs(rateLimitHits: number): number {
  const base = getPollBackoffBaseMs();
  const max = getPollBackoffMaxMs();
  const multiplier = getPollBackoffMultiplier();
  const exponent = Math.max(0, rateLimitHits - 1);
  const scaled = Math.min(base * multiplier ** exponent, max);
  const jitter = Math.floor(Math.random() * Math.min(30_000, scaled * 0.1));
  return scaled + jitter;
}
