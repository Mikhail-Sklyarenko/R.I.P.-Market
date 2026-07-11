export function isExtensionChannelEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_CHANNEL === 'true';
}

export function extensionTokenSecret(): string {
  return (
    process.env.EXTENSION_TOKEN_SECRET ??
    process.env.JWT_SECRET ??
    'dev-jwt-secret'
  );
}

export function extensionTokenTtlSeconds(): number {
  const raw = Number(process.env.EXTENSION_TOKEN_TTL_SECONDS ?? 3600);
  return Number.isFinite(raw) && raw > 0 ? raw : 3600;
}

export function extensionMaxTtlMs(): number {
  const raw = Number(process.env.EXTENSION_MAX_REQUEST_TTL_MS ?? 15_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
}

export function extensionMaxClockSkewMs(): number {
  const raw = Number(process.env.EXTENSION_MAX_CLOCK_SKEW_MS ?? 5_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5_000;
}
