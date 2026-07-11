import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamCommunityClient } from './steam-community-client.js';
import { STEAM_WEB_API_KEY_STORAGE_KEY } from './steam-web-api-settings.js';

vi.mock('./steam-tab-utils.js', () => ({
  navigateTab: vi.fn().mockResolvedValue(undefined),
  waitForTabLoad: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./steam-page-inventory.js', () => ({
  loadInventoryViaPageScript: vi.fn(),
}));

vi.mock('./steam-cookie-client.js', () => ({
  loadCs2InventoryFromCookies: vi.fn(),
}));

describe('SteamCommunityClient.loadInventory web API fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
        },
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1 }),
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://steamcommunity.com/inventory' }]),
        create: vi.fn(),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not call web API when key is missing', async () => {
    const { loadInventoryViaPageScript } = await import('./steam-page-inventory.js');
    const { loadCs2InventoryFromCookies } = await import('./steam-cookie-client.js');
    vi.mocked(loadInventoryViaPageScript).mockResolvedValue({
      items: [],
      rateLimited: true,
    });
    vi.mocked(loadCs2InventoryFromCookies).mockResolvedValue({
      items: [],
      rateLimited: true,
    });

    const client = new SteamCommunityClient();
    const items = await client.loadInventory('76561198000000000');

    expect(items).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to web API on 429 when key is configured', async () => {
    const { loadInventoryViaPageScript } = await import('./steam-page-inventory.js');
    const { loadCs2InventoryFromCookies } = await import('./steam-cookie-client.js');
    vi.mocked(loadInventoryViaPageScript).mockResolvedValue({
      items: [],
      rateLimited: true,
    });
    vi.mocked(loadCs2InventoryFromCookies).mockResolvedValue({
      items: [],
      rateLimited: true,
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({
      [STEAM_WEB_API_KEY_STORAGE_KEY]: 'test-api-key',
    }));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          success: 1,
          assets: [
            {
              assetid: 'asset-429',
              classid: 'class-1',
              instanceid: 'instance-1',
            },
          ],
          descriptions: [
            {
              classid: 'class-1',
              instanceid: 'instance-1',
              market_hash_name: 'Desert Eagle | Blaze (Factory New)',
            },
          ],
        },
      }),
    } as Response);

    const client = new SteamCommunityClient();
    const items = await client.loadInventory('76561198000000000');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('GetInventoryItemsWithDescriptions'),
    );
    expect(items).toEqual([
      {
        assetId: 'asset-429',
        classId: 'class-1',
        instanceId: 'instance-1',
        marketHashName: 'Desert Eagle | Blaze (Factory New)',
        floatValue: null,
      },
    ]);
  });
});
