import { observeSteamInventory } from './inventory-observation';
import { fetchAllSteamInventoryPages } from '../providers/inventory/steam-inventory.client';
jest.mock('../providers/inventory/steam-inventory.client', () => ({
  fetchAllSteamInventoryPages: jest.fn(),
}));
const fetchAll = jest.mocked(fetchAllSteamInventoryPages);
beforeEach(() => fetchAll.mockReset());
it('merges normal and protected contexts, retaining their provenance', async () => {
  fetchAll.mockImplementation(async (_id, _fetch, context) => ({
    success: 1,
    assets: [
      {
        appid: 730,
        contextid: context!,
        assetid: context === '2' ? '123' : '456',
        classid: '1',
        instanceid: '0',
      },
    ],
    descriptions: [{ classid: '1', instanceid: '0', market_hash_name: 'skin' }],
    more_items: 0,
  }));
  const result = await observeSteamInventory('76561198195181115');
  expect(result.assets.map((a) => [a.contextId, a.assetId])).toEqual([
    ['2', '123'],
    ['16', '456'],
  ]);
});
it('does not certify normal-only inventory when protected context fails', async () => {
  fetchAll
    .mockResolvedValueOnce({ success: 1, assets: [], more_items: 0 })
    .mockRejectedValueOnce(new Error('temporary 403'));
  await expect(observeSteamInventory('76561198195181115')).rejects.toThrow();
});
it('partial pagination cannot become a complete observation', async () => {
  fetchAll.mockResolvedValue({ success: 1, assets: [], more_items: 1 });
  await expect(observeSteamInventory('76561198195181115')).rejects.toThrow(
    'INCOMPLETE',
  );
});
it('missing descriptions cannot silently discard assets', async () => {
  fetchAll.mockResolvedValue({
    success: 1,
    assets: [
      {
        appid: 730,
        contextid: '2',
        assetid: '123',
        classid: '1',
        instanceid: '0',
      },
    ],
  });
  await expect(observeSteamInventory('76561198195181115')).rejects.toThrow(
    'METADATA_INCOMPLETE',
  );
});
