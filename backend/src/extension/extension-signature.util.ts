import { createHash, verify } from 'crypto';

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

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function signatureMessage(input: {
  sessionId: string;
  deviceId: string;
  nonce: string;
  timestampMs: number;
  ttlMs: number;
  payload: unknown;
}): string {
  return [
    input.sessionId,
    input.deviceId,
    input.nonce,
    String(input.timestampMs),
    String(input.ttlMs),
    payloadHash(input.payload),
  ].join('.');
}

export function verifySignature(params: {
  publicKey: string;
  message: string;
  signatureBase64: string;
}): boolean {
  return verify(
    'RSA-SHA256',
    Buffer.from(params.message, 'utf8'),
    params.publicKey,
    Buffer.from(params.signatureBase64, 'base64'),
  );
}
