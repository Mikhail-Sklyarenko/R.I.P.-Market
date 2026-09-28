import { signatureMessage } from '@rip-market/extension-orchestrator';
import { getSessionState, ensureDeviceKeys, signMessage } from './storage.js';

const BASE = 'https://p2pcs.ru/api/v1';
const OWNER = '76561198195181115';

export function tokenForProbe(value: string | undefined): string | null {
  try {
    const parts = decodeURIComponent(value ?? '').split('||');
    if (parts.length !== 2 || parts[0] !== OWNER || !/^[A-Za-z0-9._-]{32,8192}$/.test(parts[1])) return null;
    return parts[1];
  } catch { return null; }
}

/** Invoked only from our popup after explicit consent, never from website messages. */
export async function runSteamAuthProbe(): Promise<Record<string, boolean | number>> {
  const state = await getSessionState();
  if (!state || state.apiBaseUrl.replace(/\/$/, '') !== BASE || Date.parse(state.expiresAt) <= Date.now()) throw new Error('PROBE_UNAVAILABLE');
  const keys = await ensureDeviceKeys();
  if (state.deviceId !== keys.deviceId) throw new Error('PROBE_UNAVAILABLE');
  const post = async (suffix: string, payload: Record<string, unknown>) => {
    const envelope = { deviceId: keys.deviceId, nonce: crypto.randomUUID(), timestampMs: Date.now(), ttlMs: 10000, payload };
    const signature = await signMessage(keys.privateKeyJwk, await signatureMessage({ ...envelope, sessionId: state.sessionId }));
    const response = await fetch(`${BASE}/extension/steam-auth-probe${suffix}`, {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(35000),
      headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envelope, signature }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('PROBE_UNAVAILABLE'); }
    return await response.json() as Record<string, unknown>;
  };
  // Confirm server authorization/window before reading any Steam credential.
  if ((await post('/preflight', {})).allowed !== true) throw new Error('PROBE_UNAVAILABLE');
  const cookie = await chrome.cookies.get({ url: 'https://steamcommunity.com/', name: 'steamLoginSecure' });
  let accessToken = tokenForProbe(cookie?.value);
  if (cookie) cookie.value = '';
  if (!accessToken) throw new Error('PROBE_WRONG_STEAM_ACCOUNT');
  try {
    const result = await post('', { accessToken, consent: true });
    const safe: Record<string, boolean | number> = {};
    for (const key of ['diagnosticOnly', 'exactOffer', 'offerMatchesOrder', 'offerAccepted', 'exactReceipt', 'receiptPartnerMatches', 'receiptComplete', 'protectedContext', 'receiptMappingVerified', 'settlementAuthorized']) {
      if (typeof result[key] === 'boolean') safe[key] = result[key];
    }
    for (const key of ['offerHttpStatus', 'receiptHttpStatus']) {
      if (typeof result[key] === 'number' && Number.isInteger(result[key]) && result[key] >= 0 && result[key] <= 599) safe[key] = result[key];
    }
    return safe;
  } finally { accessToken = null; }
}
