import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheSentOffer,
  getCachedSentOffer,
  getInterceptedOfferByAssetId,
  markSendInflight,
  getSendInflight,
  clearSendInflight,
  recordInterceptedOffer,
  resolvePriorSuccessfulSend,
} from './trade-offer-sent-cache.js';

describe('trade-offer-sent-cache', () => {
  const sessionStorage = new Map<string, unknown>();
  const localStorageMap = new Map<string, unknown>();

  beforeEach(() => {
    sessionStorage.clear();
    localStorageMap.clear();
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              if (sessionStorage.has(k)) out[k] = sessionStorage.get(k);
            }
            return out;
          }),
          set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
            for (const [k, entry] of Object.entries(value)) {
              sessionStorage.set(k, entry);
            }
          }),
          remove: vi.fn().mockImplementation(async (key: string | string[]) => {
            for (const k of Array.isArray(key) ? key : [key]) {
              sessionStorage.delete(k);
            }
          }),
        },
        local: {
          get: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              if (localStorageMap.has(k)) out[k] = localStorageMap.get(k);
            }
            return out;
          }),
          set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
            for (const [k, entry] of Object.entries(value)) {
              localStorageMap.set(k, entry);
            }
          }),
          remove: vi.fn().mockImplementation(async (key: string | string[]) => {
            for (const k of Array.isArray(key) ? key : [key]) {
              localStorageMap.delete(k);
            }
          }),
        },
      },
    });
  });

  it('persists sent offers to local storage for SW restart recovery', async () => {
    await cacheSentOffer(
      'draft-1',
      { ok: true, offerId: '12345678', confirmPending: true },
      { assetId: 'asset-1', marketHashName: 'AK-47' },
    );

    sessionStorage.clear();
    const cached = await getCachedSentOffer('draft-1');
    expect(cached).toEqual({
      ok: true,
      offerId: '12345678',
      confirmPending: true,
      assetId: 'asset-1',
      marketHashName: 'AK-47',
      floatValue: null,
    });
  });

  it('resolves intercepted offer by asset id', async () => {
    await recordInterceptedOffer({
      offerId: '87654321',
      confirmPending: false,
      assetId: 'asset-42',
    });

    expect(await getInterceptedOfferByAssetId('asset-42')).toMatchObject({
      ok: true,
      offerId: '87654321',
    });
    expect(
      await resolvePriorSuccessfulSend({
        draftId: 'draft-missing',
        assetId: 'asset-42',
      }),
    ).toMatchObject({ offerId: '87654321' });
  });

  it('tracks send inflight markers with TTL cleanup helpers', async () => {
    await markSendInflight({ draftId: 'draft-9', assetId: 'a-9' });
    expect(await getSendInflight('draft-9')).toMatchObject({
      draftId: 'draft-9',
      assetId: 'a-9',
    });
    await clearSendInflight('draft-9');
    expect(await getSendInflight('draft-9')).toBeNull();
  });
});
