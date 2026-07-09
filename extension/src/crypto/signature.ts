export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const asRecord = value as Record<string, unknown>;
  const keys = Object.keys(asRecord).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(asRecord[key])}`)
    .join(',')}}`;
}

export async function payloadHash(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function signatureMessage(input: {
  sessionId: string;
  deviceId: string;
  nonce: string;
  timestampMs: number;
  ttlMs: number;
  payload: unknown;
}): Promise<string> {
  const hash = await payloadHash(input.payload);
  return [
    input.sessionId,
    input.deviceId,
    input.nonce,
    String(input.timestampMs),
    String(input.ttlMs),
    hash,
  ].join('.');
}
