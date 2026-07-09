export function isSettlementHoldWindowEnabled(): boolean {
  return process.env.ENABLE_SETTLEMENT_HOLD_WINDOW === 'true';
}

export function getSettlementHoldDays(): number {
  const value = Number(process.env.SETTLEMENT_HOLD_DAYS ?? 8);
  return Number.isFinite(value) && value > 0 ? value : 8;
}

export function getSettlementHoldMs(): number {
  return getSettlementHoldDays() * 24 * 60 * 60 * 1000;
}

export function getSettlementReleaseBatchSize(): number {
  const value = Number(process.env.SETTLEMENT_RELEASE_BATCH_SIZE ?? 50);
  return Number.isFinite(value) && value > 0 ? value : 50;
}

export function getSettlementReleaseIntervalMs(): number {
  const value = Number(process.env.SETTLEMENT_RELEASE_INTERVAL_MS ?? 60_000);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

export function settlementHoldEnterIdempotencyKey(orderId: string): string {
  return `settlement-hold-enter:${orderId}`;
}

export function settlementHoldReleaseIdempotencyKey(orderId: string): string {
  return `settlement-release:${orderId}`;
}

export function settlementHoldReverseIdempotencyKey(orderId: string): string {
  return `settlement-hold-reverse:${orderId}`;
}
