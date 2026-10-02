import {
  fetchSteamInventoryPage,
  fetchAllSteamInventoryPages,
} from './steam-inventory.client';
import fixture from './fixtures/steam-inventory-page1.json';
import { SteamInventoryResponse } from './steam-inventory.parser';

describe('steam-inventory.client', () => {
  it('paginates protected context 16 without reverting to context 2', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          success: 1,
          assets: [{ assetid: '1' }],
          more_items: 1,
          last_assetid: '1',
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: { success: 1, assets: [{ assetid: '2' }], more_items: 0 },
      });
    const result = await fetchAllSteamInventoryPages(
      '76561198000000000',
      fetchFn,
      '16',
    );
    expect(result.assets).toHaveLength(2);
    expect(result.more_items).toBe(0);
    for (const [url] of fetchFn.mock.calls) expect(url).toContain('/730/16');
    expect(fetchFn.mock.calls[1][0]).toContain('start_assetid=1');
  });
  it('rejects a stalled pagination cursor instead of certifying a partial inventory', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      body: { success: 1, more_items: 1, last_assetid: '1' },
    });
    await expect(
      fetchAllSteamInventoryPages('76561198000000000', fetchFn, '16'),
    ).rejects.toThrow('INCOMPLETE');
  });
  it('fetches and returns parsed inventory page via injectable fetchFn', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      body: fixture as SteamInventoryResponse,
    });

    const result = await fetchSteamInventoryPage({
      steamId: '76561198000000000',
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/inventory/76561198000000000/730/2'),
    );
    expect(result.assets).toHaveLength(2);
  });

  it('throws for private inventory responses', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      body: { success: 15 },
    });

    await expect(
      fetchSteamInventoryPage({
        steamId: '76561198000000000',
        fetchFn,
      }),
    ).rejects.toThrow('Steam inventory is private');
  });

  it('throws STEAM_BLOCKED for Akamai/CDN 403 without private success flag', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 403,
      body: null,
    });

    await expect(
      fetchSteamInventoryPage({
        steamId: '76561198000000000',
        fetchFn,
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/blocked this server IP/i),
      code: 'STEAM_BLOCKED',
    });
  });

  it('throws for invalid steam id responses without crashing on null body', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 404,
      body: null,
    });

    await expect(
      fetchSteamInventoryPage({
        steamId: 'steam_mock_seller',
        fetchFn,
      }),
    ).rejects.toThrow('Steam inventory API returned 404');
  });
});
