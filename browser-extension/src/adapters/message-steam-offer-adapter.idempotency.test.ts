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
    loadInventory: vi.fn().mockResolvedValue([]),
    navigateToTradePage: vi.fn().mockResolvedValue(42),
    sendTradeOffer,
  } as unknown as SteamCommunityClient;
}

describe('MessageSteamOfferAdapter idempotency', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockImplementation(async (key: string) => {
            if (storage.has(key)) {
              return { [key]: storage.get(key) };
            }
            return {};
          }),
          set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
            for (const [key, entry] of Object.entries(value)) {
              storage.set(key, entry);
            }
          }),
          remove: vi.fn().mockImplementation(async (key: string) => {
            storage.delete(key);
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

    storage.set('rip:draft:draft-task-1', {
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
});
