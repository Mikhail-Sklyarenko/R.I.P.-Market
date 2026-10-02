import { signatureMessage } from '@rip-market/extension-orchestrator';
import { getSessionState, ensureDeviceKeys, signMessage } from './storage.js';
const BASE = 'https://p2pcs.ru/api/v1';
const CONSENT = 'steam-order-verification-consent-v1';
let running = false;
let nextAt = 0;
type Consent = { permissionId: string; orderId: string; sessionId: string; expiresAt: number };
export async function hasSteamOrderVerificationConsent(orderId:string):Promise<boolean> {
  const consent=(await chrome.storage.session.get(CONSENT))[CONSENT] as Consent|undefined;
  const state=await getSessionState();
  return !!consent && !!state && consent.orderId===orderId && consent.sessionId===state.sessionId && consent.expiresAt>Date.now() && Date.parse(state.expiresAt)>Date.now() && state.apiBaseUrl.replace(/\/$/,'')===BASE;
}
export function tokenForOrder(value: string | undefined, owner: unknown): string | null {
  try {
    if (typeof owner !== 'string' || !/^7656119[0-9]{10}$/.test(owner)) return null;
    const parts = decodeURIComponent(value ?? '').split('||');
    return parts.length === 2 && parts[0] === owner && /^[A-Za-z0-9._-]{32,8192}$/.test(parts[1]) ? parts[1] : null;
  } catch { return null; }
}
export async function stopSteamOrderVerification(): Promise<void> {
  await chrome.storage.session.remove(CONSENT);
}
export async function enableSteamOrderVerification(orderId: string): Promise<Record<string, unknown>> {
  if (!/^[a-f0-9-]{36}$/i.test(orderId)) throw new Error('INVALID_ORDER');
  const state = await getSessionState();
  if (!state || state.apiBaseUrl.replace(/\/$/,'') !== BASE || Date.parse(state.expiresAt) <= Date.now()) throw new Error('SESSION_REQUIRED');
  const consent: Consent = { permissionId: crypto.randomUUID(), orderId, sessionId: state.sessionId, expiresAt: Math.min(Date.now()+30*60000,Date.parse(state.expiresAt)) };
  await chrome.storage.session.set({ [CONSENT]: consent });
  nextAt = 0;
  return await tickSteamOrderVerification();
}
export async function tickSteamOrderVerification(): Promise<Record<string, unknown>> {
  if (running || Date.now() < nextAt) return { reasonCode: 'CHECK_SCHEDULED' };
  running = true;
  try {
    const consent = (await chrome.storage.session.get(CONSENT))[CONSENT] as Consent | undefined;
    if (!consent) return { reasonCode: 'CONSENT_REQUIRED' };
    const state = await getSessionState();
    if (!state || consent.sessionId !== state.sessionId || consent.expiresAt <= Date.now() ||
        Date.parse(state.expiresAt) <= Date.now() || state.apiBaseUrl.replace(/\/$/,'') !== BASE) {
      await stopSteamOrderVerification(); return { reasonCode: 'CONSENT_EXPIRED' };
    }
    nextAt = Date.now()+65000;
    const assertConsent = async () => {
      const current = (await chrome.storage.session.get(CONSENT))[CONSENT] as Consent | undefined;
      if (!current || current.permissionId !== consent.permissionId || current.expiresAt <= Date.now()) throw new Error('CONSENT_EXPIRED');
    };
    const keys = await ensureDeviceKeys();
    if (keys.deviceId !== state.deviceId) throw new Error('SESSION_REQUIRED');
    const post = async (suffix: string, payload: Record<string,unknown>) => {
      const envelope = { deviceId: keys.deviceId, nonce: crypto.randomUUID(), timestampMs: Date.now(), ttlMs:10000, payload };
      const signature = await signMessage(keys.privateKeyJwk,await signatureMessage({...envelope,sessionId:state.sessionId}));
      const response = await fetch(`${BASE}/extension/steam-order-verification${suffix}`, {
        method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(120000),
        headers:{Authorization:`Bearer ${state.accessToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({...envelope,signature}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([400,401,403].includes(response.status)) await stopSteamOrderVerification();
        throw new Error(response.status===429?'STEAM_RATE_LIMITED':'VERIFICATION_UNAVAILABLE');
      }
      return await response.json() as Record<string,unknown>;
    };
    const preflight = await post('/preflight',{orderId:consent.orderId});
    // Consent may be granted at the beginning of the order. No credential is
    // read until the server has bound an offer; the heartbeat resumes itself.
    await assertConsent();
    if(preflight.allowed===true && preflight.waitingForOffer===true && preflight.baselineReady===true) return {reasonCode:'WAITING_FOR_OFFER',baselineReady:true};
    if(preflight.baselineReady===false) {
      const reasons=['BUYER_STEAM_ID_MISSING','MANUAL_REVIEW','BASELINE_EXPIRED','BASELINE_ORIGINAL_MISSING','BASELINE_UNAVAILABLE','MAPPING_WINDOW_BUSY','BASELINE_RETRY_SCHEDULED'];
      return {reasonCode:reasons.includes(String(preflight.preparationReason)) ? preflight.preparationReason : 'BEFORE_BASELINE_NOT_READY',baselineReady:false};
    }
    if (preflight.allowed!==true || typeof preflight.offerId!=='string' || !/^[1-9][0-9]{0,19}$/.test(preflight.offerId)) throw new Error('VERIFICATION_UNAVAILABLE');
    await assertConsent();
    const cookie = await chrome.cookies.get({url:'https://steamcommunity.com/',name:'steamLoginSecure'});
    let accessToken=tokenForOrder(cookie?.value,preflight.ownerSteamId);
    if(cookie) cookie.value='';
    if(!accessToken) { await stopSteamOrderVerification(); throw new Error('WRONG_STEAM_ACCOUNT'); }
    try {
      await assertConsent();
      const result=await post('',{orderId:consent.orderId,offerId:preflight.offerId,consent:true,accessToken});
      const safe: Record<string,unknown>={};
      for(const key of ['mappingVerified','transitioned','diagnosticOnly']) if(typeof result[key]==='boolean') safe[key]=result[key];
      const reasons=['DELIVERY_VERIFIED','SETTLED','STEAM_TRADE_REVERSAL','STEAM_IDENTITY_CONFLICT','WAITING_FOR_OFFER','STEAM_DESTINATION_MAPPING_PENDING','STEAM_RECEIPT_VERIFIED','STEAM_RECEIPT_UNAVAILABLE','STEAM_TOKEN_OWNER_UNVERIFIED','STEAM_TOKEN_READ_UNAVAILABLE','STEAM_OFFER_UNAVAILABLE','STEAM_OFFER_ORDER_MISMATCH','STEAM_RECEIPT_MAPPING_UNAVAILABLE'];
      if(typeof result.reasonCode==='string' && reasons.includes(result.reasonCode)) safe.reasonCode=result.reasonCode;
      if(typeof result.offerStatus==='string' && ['unknown','pending','needs_confirmation','accepted','declined','expired'].includes(result.offerStatus)) safe.offerStatus=result.offerStatus;
      if(['STEAM_IDENTITY_CONFLICT','STEAM_TRADE_REVERSAL'].includes(String(result.reasonCode)) || result.diagnosticOnly===true || result.transitioned===true || ['declined','expired'].includes(String(result.offerStatus))) await stopSteamOrderVerification();
      return safe;
    } finally { accessToken=null; }
  } finally { running=false; }
}
