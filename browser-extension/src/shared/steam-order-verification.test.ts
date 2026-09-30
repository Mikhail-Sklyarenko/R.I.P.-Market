import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {enableSteamOrderVerification,stopSteamOrderVerification,tickSteamOrderVerification,tokenForOrder} from './steam-order-verification.js';
import {getSessionState,ensureDeviceKeys,signMessage} from './storage.js';
vi.mock('./storage.js',()=>({getSessionState:vi.fn(),ensureDeviceKeys:vi.fn(),signMessage:vi.fn()}));
vi.mock('@rip-market/extension-orchestrator',()=>({signatureMessage:vi.fn().mockResolvedValue('signature')}));
const id='0f57e21a-6068-4a8e-a67c-12671ad6ba5a';
const token='synthetic-test-credential-not-real-12345';
let values:Record<string,unknown>,cookie:any,outbound:any;
beforeEach(()=>{
 values={};cookie=vi.fn(async()=>({value:'76561198195181115||'+token}));outbound=vi.fn();
 vi.stubGlobal('chrome',{storage:{session:{get:vi.fn(async()=>({...values})),set:vi.fn(async(data)=>Object.assign(values,data)),remove:vi.fn(async key=>{delete values[key];})}},cookies:{get:cookie}});
 vi.stubGlobal('fetch',outbound);
 vi.mocked(getSessionState).mockResolvedValue({apiBaseUrl:'https://p2pcs.ru/api/v1',sessionId:'session',deviceId:'device',accessToken:'site-token',expiresAt:new Date(Date.now()+600000).toISOString()});
 vi.mocked(ensureDeviceKeys).mockResolvedValue({deviceId:'device',privateKeyJwk:{},publicKeyPem:'key'});
 vi.mocked(signMessage).mockResolvedValue('signature');
});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('binds cookie to authenticated preflight owner',()=>{
 expect(tokenForOrder('76561198195181115||'+token,'76561198195181115')).toBe(token);
 expect(tokenForOrder('76561198195181115||'+token,'76561198655632881')).toBeNull();
});
it('reads no credential without successful server authorization',async()=>{
 outbound.mockResolvedValue({ok:false,status:403,body:{cancel:vi.fn()}});
 await expect(enableSteamOrderVerification(id)).rejects.toThrow();expect(cookie).not.toHaveBeenCalled();
});
it('sends credential only to fixed server, stores consent but never token',async()=>{
 outbound.mockResolvedValueOnce({ok:true,json:async()=>({allowed:true,ownerSteamId:'76561198195181115',offerId:'9394782030'})})
 .mockResolvedValueOnce({ok:true,json:async()=>({mappingVerified:false,reasonCode:'STEAM_RECEIPT_MAPPING_UNAVAILABLE',secret:token})});
 expect(await enableSteamOrderVerification(id)).toEqual({mappingVerified:false,reasonCode:'STEAM_RECEIPT_MAPPING_UNAVAILABLE'});
 expect(JSON.stringify(values)).not.toContain(token);
 expect(outbound.mock.calls[1][0]).toBe('https://p2pcs.ru/api/v1/extension/steam-order-verification');
 expect(JSON.parse(outbound.mock.calls[1][1].body).payload).toMatchObject({orderId:id,offerId:'9394782030',consent:true,accessToken:token});
 await stopSteamOrderVerification();expect(Object.keys(values)).toHaveLength(0);
});
it('rejects alternate backend before reading Steam',async()=>{
 vi.mocked(getSessionState).mockResolvedValue({apiBaseUrl:'https://other.invalid',sessionId:'session',deviceId:'device',accessToken:'site-token',expiresAt:new Date(Date.now()+600000).toISOString()});
 await expect(enableSteamOrderVerification(id)).rejects.toThrow();expect(cookie).not.toHaveBeenCalled();expect(outbound).not.toHaveBeenCalled();
});
it('consent before offer creation waits automatically without reading a token',async()=>{
 outbound.mockResolvedValueOnce({ok:true,json:async()=>({allowed:true,waitingForOffer:true,offerId:null})});
 expect(await enableSteamOrderVerification(id)).toEqual({reasonCode:'WAITING_FOR_OFFER'});
 expect(cookie).not.toHaveBeenCalled();expect(JSON.stringify(values)).not.toContain(token);
});
