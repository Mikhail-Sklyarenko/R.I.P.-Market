import { fetchSteamInventoryPage } from './steam-inventory.client';
import fixture from './fixtures/steam-inventory-page1.json';
import { SteamInventoryResponse } from './steam-inventory.parser';

describe('steam-inventory.client', () => {
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
