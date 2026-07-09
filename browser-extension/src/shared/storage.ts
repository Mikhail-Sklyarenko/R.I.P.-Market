const ALGO = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  hash: 'SHA-256',
} as const;

export type StoredKeyPair = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyJwk: JsonWebKey;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function exportSpkiPem(publicKey: CryptoKey): Promise<string> {
  return crypto.subtle.exportKey('spki', publicKey).then((buffer) => {
    const base64 = arrayBufferToBase64(buffer);
    const lines = base64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
  });
}

export async function ensureDeviceKeys(): Promise<StoredKeyPair> {
  const stored = await chrome.storage.local.get(['deviceId', 'publicKeyPem', 'privateKeyJwk']);
  if (stored.deviceId && stored.publicKeyPem && stored.privateKeyJwk) {
    return {
      deviceId: stored.deviceId as string,
      publicKeyPem: stored.publicKeyPem as string,
      privateKeyJwk: stored.privateKeyJwk as JsonWebKey,
    };
  }
  const keyPair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const publicKeyPem = await exportSpkiPem(keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId, publicKeyPem, privateKeyJwk });
  return { deviceId, publicKeyPem, privateKeyJwk };
}

export async function signMessage(
  privateKeyJwk: JsonWebKey,
  message: string,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    ALGO,
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    ALGO,
    privateKey,
    new TextEncoder().encode(message),
  );
  return arrayBufferToBase64(signature);
}

export type ExtensionSessionState = {
  sessionId: string;
  deviceId: string;
  accessToken: string;
  expiresAt: string;
  apiBaseUrl: string;
};

export async function getSessionState(): Promise<ExtensionSessionState | null> {
  const stored = await chrome.storage.local.get([
    'sessionId',
    'deviceId',
    'accessToken',
    'expiresAt',
    'apiBaseUrl',
  ]);
  if (!stored.sessionId || !stored.accessToken || !stored.apiBaseUrl) {
    return null;
  }
  return stored as ExtensionSessionState;
}

export async function saveSessionState(state: ExtensionSessionState): Promise<void> {
  await chrome.storage.local.set({
    sessionId: state.sessionId,
    deviceId: state.deviceId,
    accessToken: state.accessToken,
    expiresAt: state.expiresAt,
    apiBaseUrl: state.apiBaseUrl,
  });
}

export async function assertSessionDeviceConsistency(): Promise<boolean> {
  const keys = await ensureDeviceKeys();
  const state = await getSessionState();
  if (!state) {
    return true;
  }
  if (state.deviceId !== keys.deviceId) {
    await clearSessionState();
    return false;
  }
  return true;
}

export async function clearSessionState(): Promise<void> {
  await chrome.storage.local.remove([
    'sessionId',
    'accessToken',
    'expiresAt',
    'apiBaseUrl',
  ]);
}

export function getDefaultApiBaseUrl(): string {
  return 'http://localhost:3000/api/v1';
}
