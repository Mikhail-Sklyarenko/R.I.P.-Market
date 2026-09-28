import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tokenForProbe, runSteamAuthProbe } from './steam-auth-probe.js';
import { getSessionState, ensureDeviceKeys, signMessage } from './storage.js';
vi.mock('./storage.js', () => ({ getSessionState: vi.fn(), ensureDeviceKeys: vi.fn(), signMessage: vi.fn() }));
vi.mock('@rip-market/extension-orchestrator', () => ({ signatureMessage: vi.fn().mockResolvedValue('signature-input') }));
describe('Steam probe cookie scope', () => {
  const token = 'synthetic-test-token-not-a-real-credential';
  it('extracts only the explicitly authorized account token', () => {
    expect(tokenForProbe(`76561198195181115%7C%7C${token}`)).toBe(token);
  });
  it('binds the buyer token only to a buyer preflight and rejects other owners', () => {
    expect(tokenForProbe(`76561198655632881||${token}`, '76561198655632881')).toBe(token);
    expect(tokenForProbe(`76561198195181115||${token}`, '76561198655632881')).toBeNull();
    expect(tokenForProbe(`76561198000000000||${token}`, '76561198000000000')).toBeNull();
  });
  it.each([undefined, '%bad', '76561198655632881||' + token, '76561198195181115||short', '76561198195181115||' + token + '||extra'])('rejects wrong account or malformed value %s', value => {
    expect(tokenForProbe(value)).toBeNull();
  });
});

describe('Steam probe transmission boundary', () => {
  let cookieRead: ReturnType<typeof vi.fn>;
  let outbound: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.mocked(getSessionState).mockResolvedValue({ apiBaseUrl: 'https://p2pcs.ru/api/v1', sessionId: 'session', deviceId: 'device', accessToken: 'site-token', expiresAt: new Date(Date.now() + 600000).toISOString() });
    vi.mocked(ensureDeviceKeys).mockResolvedValue({ deviceId: 'device', privateKeyJwk: {}, publicKeyPem: 'key' });
    vi.mocked(signMessage).mockResolvedValue('signature');
    cookieRead = vi.fn().mockResolvedValue({ value: '76561198195181115||synthetic-test-token-not-a-real-credential' });
    outbound = vi.fn().mockResolvedValue({ ok: false, body: { cancel: vi.fn() } });
    vi.stubGlobal('chrome', { cookies: { get: cookieRead } });
    vi.stubGlobal('fetch', outbound);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it('never reads Steam credentials when server preflight denies', async () => {
    await expect(runSteamAuthProbe()).rejects.toThrow();
    expect(cookieRead).not.toHaveBeenCalled();
    expect(outbound).toHaveBeenCalledTimes(1);
  });
  it('rejects alternate backend destinations before cookie access', async () => {
    vi.mocked(getSessionState).mockResolvedValue({ apiBaseUrl: 'https://elsewhere.invalid/api/v1', sessionId: 'session', deviceId: 'device', accessToken: 'site-token', expiresAt: new Date(Date.now() + 600000).toISOString() });
    await expect(runSteamAuthProbe()).rejects.toThrow();
    expect(cookieRead).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
  it('transmits only to fixed HTTPS endpoint and drops untrusted response strings', async () => {
    outbound.mockResolvedValueOnce({ ok: true, json: async () => ({ allowed: true, ownerSteamId: '76561198195181115' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ exactOffer: true, offerHttpStatus: 200, secret: 'do-not-return', exactReceipt: 'do-not-return' }) });
    expect(await runSteamAuthProbe()).toEqual({ exactOffer: true, offerHttpStatus: 200 });
    expect(outbound).toHaveBeenCalledTimes(2);
    const [destination, request] = outbound.mock.calls[1];
    expect(destination).toBe('https://p2pcs.ru/api/v1/extension/steam-auth-probe');
    expect(request.redirect).toBe('error');
    expect(request.credentials).toBe('omit');
    expect(JSON.parse(request.body).payload).toEqual({ accessToken: 'synthetic-test-token-not-a-real-credential', consent: true });
  });
});
