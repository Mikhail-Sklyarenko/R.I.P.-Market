import { InventorySyncStatus } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { InventorySyncCacheService } from './inventory-sync-cache.service';
import { SteamInventoryProvider } from './steam-inventory.provider';
import { InventoryMetricsService } from './inventory-metrics.service';
import * as steamClient from './steam-inventory.client';
import fixture from './fixtures/steam-inventory-page1.json';
import { SteamInventoryResponse } from './steam-inventory.parser';

describe('SteamInventoryProvider', () => {
  let provider: SteamInventoryProvider;
  let prisma: {
    itemDefinition: { upsert: jest.Mock };
    inventoryAsset: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let syncCache: jest.Mocked<
    Pick<InventorySyncCacheService, 'getLatestRun' | 'recordRun' | 'isCacheValid' | 'isWithinRateLimit'>
  >;
  let metrics: InventoryMetricsService;

  beforeEach(() => {
    prisma = {
      itemDefinition: { upsert: jest.fn().mockResolvedValue({ id: 'def-1' }) },
      inventoryAsset: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    syncCache = {
      getLatestRun: jest.fn().mockResolvedValue(null),
      recordRun: jest.fn().mockResolvedValue({
        status: InventorySyncStatus.SUCCESS,
        itemCount: 2,
        fetchedAt: new Date('2026-06-26T12:00:00Z'),
        expiresAt: new Date('2026-06-26T12:05:00Z'),
        errorCode: null,
      }),
      isCacheValid: jest.fn().mockReturnValue(false),
      isWithinRateLimit: jest.fn().mockReturnValue(false),
    };
    metrics = new InventoryMetricsService();
    provider = new SteamInventoryProvider(
      prisma as never,
      syncCache as unknown as InventorySyncCacheService,
      metrics,
    );

    jest.spyOn(steamClient, 'fetchAllSteamInventoryPages').mockResolvedValue(
      fixture as SteamInventoryResponse,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches Steam inventory and upserts assets', async () => {
    const result = await provider.syncInventory('user-1', '76561198000000000');

    expect(steamClient.fetchAllSteamInventoryPages).toHaveBeenCalledWith(
      '76561198000000000',
    );
    expect(prisma.inventoryAsset.upsert).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('SUCCESS');
    expect(result.itemCount).toBe(2);
    expect(result.cacheHit).toBe(false);
  });

  it('returns cache hit when TTL is valid', async () => {
    const cachedRun = {
      status: InventorySyncStatus.SUCCESS,
      itemCount: 5,
      fetchedAt: new Date('2026-06-26T12:00:00Z'),
      expiresAt: new Date('2026-06-26T12:10:00Z'),
      errorCode: null,
    };
    syncCache.getLatestRun.mockResolvedValue(cachedRun as never);
    syncCache.isCacheValid.mockReturnValue(true);

    const result = await provider.syncInventory('user-1', '76561198000000000');

    expect(steamClient.fetchAllSteamInventoryPages).not.toHaveBeenCalled();
    expect(result.status).toBe('CACHE_HIT');
    expect(result.cacheHit).toBe(true);
  });

  it('throws STEAM_NOT_LINKED for placeholder steam ids', async () => {
    await expect(
      provider.syncInventory('user-1', 'steam_mock_seller'),
    ).rejects.toMatchObject({
      code: ErrorCode.STEAM_NOT_LINKED,
    });
  });

  it('throws STEAM_PROFILE_PRIVATE when inventory is private and no cache exists', async () => {
    const privateError = Object.assign(new Error('Steam inventory is private'), {
      code: 'STEAM_PROFILE_PRIVATE',
    });
    jest
      .spyOn(steamClient, 'fetchAllSteamInventoryPages')
      .mockRejectedValue(privateError);
    prisma.inventoryAsset.count.mockResolvedValue(0);

    await expect(
      provider.syncInventory('user-1', '76561198000000000'),
    ).rejects.toMatchObject({
      code: ErrorCode.STEAM_PROFILE_PRIVATE,
    });

    expect(syncCache.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: InventorySyncStatus.FAILED,
        errorCode: 'STEAM_PROFILE_PRIVATE',
      }),
    );
  });

  it('serves stale cached inventory when Steam sync fails but assets exist', async () => {
    const cachedRun = {
      status: InventorySyncStatus.SUCCESS,
      itemCount: 2,
      fetchedAt: new Date('2026-06-26T12:00:00Z'),
      expiresAt: new Date('2026-06-26T12:10:00Z'),
      errorCode: null,
    };
    syncCache.getLatestRun.mockResolvedValue(cachedRun as never);
    syncCache.isCacheValid.mockReturnValue(false);
    syncCache.isWithinRateLimit.mockReturnValue(false);
    syncCache.recordRun.mockResolvedValue({
      status: InventorySyncStatus.FAILED,
      itemCount: 2,
      fetchedAt: new Date('2026-06-26T12:01:00Z'),
      expiresAt: new Date('2026-06-26T12:06:00Z'),
      errorCode: 'INVENTORY_STALE',
    });
    prisma.inventoryAsset.count.mockResolvedValue(2);
    jest
      .spyOn(steamClient, 'fetchAllSteamInventoryPages')
      .mockRejectedValue(new Error('Steam timeout'));

    const result = await provider.syncInventory('user-1', '76561198000000000');

    expect(result.status).toBe('FAILED');
    expect(result.stale).toBe(true);
    expect(result.cacheHit).toBe(true);
    expect(result.warning).toContain('Steam timeout');
  });
});
