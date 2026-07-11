import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchInventoryViaWebApi,
  mapWebApiInventoryBody,
  toFindAssetInventoryItem,
} from './steam-api-inventory.js';

describe('steam-api-inventory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mapWebApiInventoryBody converts GetInventoryItemsWithDescriptions payload', () => {
    const mapped = mapWebApiInventoryBody({
      response: {
        success: 1,
        assets: [
          {
            assetid: '123',
            classid: '456',
            instanceid: '0',
          },
        ],
        descriptions: [
          {
            classid: '456',
            instanceid: '0',
            market_hash_name: 'AK-47 | Redline (Field-Tested)',
          },
        ],
        more_items: 0,
      },
    });

    expect(mapped.assets).toHaveLength(1);
    expect(mapped.descriptions?.[0]?.market_hash_name).toBe(
      'AK-47 | Redline (Field-Tested)',
    );
  });

  it('fetchInventoryViaWebApi loads inventory via Steam Web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          success: 1,
          assets: [
            {
              assetid: '99887766',
              classid: '111',
              instanceid: '222',
            },
          ],
          descriptions: [
            {
              classid: '111',
              instanceid: '222',
              market_hash_name: 'M4A4 | Howl (Factory New)',
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchInventoryViaWebApi('76561198000000000', 'test-api-key');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'IEconService/GetInventoryItemsWithDescriptions/v1/',
      ),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toContain('key=test-api-key');
    expect(items).toEqual([
      {
        assetId: '99887766',
        classId: '111',
        instanceId: '222',
        marketHashName: 'M4A4 | Howl (Factory New)',
        floatValue: null,
      },
    ]);
  });

  it('toFindAssetInventoryItem normalizes asset fields', () => {
    expect(
      toFindAssetInventoryItem({
        assetId: '42',
        classId: '7',
        instanceId: '1',
        marketHashName: ' Test Item ',
      }),
    ).toEqual({
      assetId: '42',
      classId: '7',
      instanceId: '1',
      marketHashName: 'Test Item',
    });
  });
});
