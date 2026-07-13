export function isReferencePriceEnabled(): boolean {
  return process.env.REFERENCE_PRICE_ENABLED === 'true';
}

export function isCsfloatReferenceEnabled(): boolean {
  return (
    isReferencePriceEnabled() &&
    process.env.CSFLOAT_REFERENCE_PRICE_ENABLED !== 'false'
  );
}

export function isBuffReferenceEnabled(): boolean {
  return (
    isReferencePriceEnabled() &&
    process.env.BUFF_REFERENCE_PRICE_ENABLED !== 'false'
  );
}

export function getReferencePriceCacheTtlMs(): number {
  const minutes = Number(process.env.REFERENCE_PRICE_CACHE_TTL_MINUTES ?? 30);
  return Number.isFinite(minutes) && minutes > 0
    ? minutes * 60_000
    : 30 * 60_000;
}
