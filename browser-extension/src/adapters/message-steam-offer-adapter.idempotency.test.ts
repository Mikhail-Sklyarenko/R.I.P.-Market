import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageSteamOfferAdapter } from './message-steam-offer-adapter.js';
import type { SteamCommunityClient } from '../shared/steam-community-client.js';

function createMockSteamClient(
  sendTradeOffer = vi.fn().mockResolvedValue({
    ok: true,
    offerId: '99887766',
    confirmPending: false,
  }),
): SteamCommunityClient {
  return {
    resolveSessionSteamId: vi.fn().mockResolvedValue('76561198000000000'),
    loadInventory: vi.fn().mockResolvedValue({ items: [], rateLimited: false }),
    navigateToTradePage: vi.fn().mockResolvedValue(42),
    sendTradeOffer,
  } as unknown as SteamCommunityClient;
}

describe('MessageSteamOfferAdapter idempotency', () => {
  const sessionStorage = new Map<string, unknown>();
  const localStorage = new Map<string, unknown>();

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              if (sessionStorage.has(k)) {
                out[k] = sessionStorage.get(k);
              }
            }
            return out;
          }),
          set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
            for (const [k, entry] of Object.entries(value)) {
              sessionStorage.set(k, entry);
            }
          }),
          remove: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            for (const k of keys) {
              sessionStorage.delete(k);
            }
          }),
        },
        local: {
          get: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              if (localStorage.has(k)) {
                out[k] = localStorage.get(k);
              }
            }
            return out;
          }),
          set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
            for (const [k, entry] of Object.entries(value)) {
              localStorage.set(k, entry);
            }
          }),
          remove: vi.fn().mockImplementation(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key];
            for (const k of keys) {
              localStorage.delete(k);
            }
          }),
        },
      },
    });
  });

  it('does not call Steam send twice for the same draft id', async () => {
    const sendTradeOffer = vi.fn().mockResolvedValue({
      ok: true,
      offerId: '99887766',
      confirmPending: false,
    });
    const adapter = new MessageSteamOfferAdapter(createMockSteamClient(sendTradeOffer));

    sessionStorage.set('rip:draft:draft-task-1', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-123', marketHashName: 'AK-47 | Redline' },
    });

    const first = await adapter.sendOffer('draft-task-1');
    const second = await adapter.sendOffer('draft-task-1');

    expect(sendTradeOffer).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      ok: true,
      offerId: '99887766',
      confirmPending: false,
    });
    expect(second).toEqual(first);
  });

  it('recovers from durable local ledger after session cache wipe', async () => {
    const sendTradeOffer = vi.fn().mockResolvedValue({
      ok: true,
      offerId: '11223344',
      confirmPending: true,
    });
    const adapter = new MessageSteamOfferAdapter(createMockSteamClient(sendTradeOffer));

    sessionStorage.set('rip:draft:draft-task-2', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-999', marketHashName: 'AWP | Asiimov' },
    });

    await adapter.sendOffer('draft-task-2');
    expect(sendTradeOffer).toHaveBeenCalledTimes(1);

    // Simulate SW restart: session wiped, local durable ledger remains.
    sessionStorage.clear();
    sessionStorage.set('rip:draft:draft-task-2', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-999', marketHashName: 'AWP | Asiimov' },
    });

    const recovered = await adapter.sendOffer('draft-task-2');
    expect(sendTradeOffer).toHaveBeenCalledTimes(1);
    expect(recovered).toEqual({
      ok: true,
      offerId: '11223344',
      confirmPending: true,
    });
  });

  it('recovers intercepted offer written during a timed-out Steam send', async () => {
    const sendTradeOffer = vi.fn().mockImplementation(async () => {
      localStorage.set('rip:intercepted-offer:asset-555', {
        offerId: '55667788',
        confirmPending: true,
        assetId: 'asset-555',
        capturedAt: new Date().toISOString(),
      });
      return { ok: false, error: 'Send interceptor timeout' };
    });
    const adapter = new MessageSteamOfferAdapter(createMockSteamClient(sendTradeOffer));

    sessionStorage.set('rip:draft:draft-task-3', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-555', marketHashName: 'M4A1-S' },
    });

    const result = await adapter.sendOffer('draft-task-3');
    expect(sendTradeOffer).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      offerId: '55667788',
      confirmPending: true,
    });
  });

  it('blocks concurrent send while inflight without a prior success', async () => {
    const deferred: {
      resolve: ((value: {
        ok: true;
        offerId: string;
        confirmPending: boolean;
      }) => void) | null;
    } = { resolve: null };
    let releaseSendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      releaseSendStarted = resolve;
    });
    const sendTradeOffer = vi.fn().mockImplementation(
      () =>
        new Promise<{
          ok: true;
          offerId: string;
          confirmPending: boolean;
        }>((resolve) => {
          deferred.resolve = resolve;
          releaseSendStarted();
        }),
    );
    const adapter = new MessageSteamOfferAdapter(createMockSteamClient(sendTradeOffer));

    sessionStorage.set('rip:draft:draft-task-4', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-777', marketHashName: 'USP-S' },
    });

    const firstPromise = adapter.sendOffer('draft-task-4');
    await sendStarted;

    const second = await adapter.sendOffer('draft-task-4');
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe('STEAM_UNAVAILABLE');
    }

    deferred.resolve?.({
      ok: true,
      offerId: '99880011',
      confirmPending: false,
    });
    const first = await firstPromise;
    expect(first).toEqual({
      ok: true,
      offerId: '99880011',
      confirmPending: false,
    });
    expect(sendTradeOffer).toHaveBeenCalledTimes(1);
  });

  it('fires mid-flow hooks during Steam send progress', async () => {
    const onItemSelected = vi.fn();
    const onOfferSubmitted = vi.fn();
    const sendTradeOffer = vi
      .fn()
      .mockImplementation(async (_draft, progress?: {
        onItemSelected?: () => void | Promise<void>;
        onOfferSubmitted?: () => void | Promise<void>;
      }) => {
        await progress?.onItemSelected?.();
        await progress?.onOfferSubmitted?.();
        return { ok: true, offerId: '44556677', confirmPending: false };
      });
    const adapter = new MessageSteamOfferAdapter(createMockSteamClient(sendTradeOffer));

    sessionStorage.set('rip:draft:draft-task-5', {
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: {
        assetId: 'asset-888',
        marketHashName: 'Glock-18',
        floatValue: '0.12',
      },
    });

    await adapter.sendOffer('draft-task-5', {
      onItemSelected,
      onOfferSubmitted,
    });

    expect(onItemSelected).toHaveBeenCalledWith({
      assetId: 'asset-888',
      marketHashName: 'Glock-18',
      floatValue: '0.12',
    });
    expect(onOfferSubmitted).toHaveBeenCalledTimes(1);
  });
});
