import { LotStatus } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const prisma = {
    lot: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    inventorySyncRun: {
      findFirst: jest.fn(),
    },
    inventoryAsset: {
      findMany: jest.fn(),
    },
  };

  const steamMarketPrice = {
    getPricesMinor: jest.fn(),
    getPricesWithMeta: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
  };

  const inventoryProvider = {
    syncInventory: jest.fn(),
  };

  const service = new InventoryService(
    prisma as never,
    inventoryProvider as never,
    steamMarketPrice as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves cached inventory immediately without waiting on Steam', async () => {
    const fetchedAt = new Date('2026-07-19T10:00:00.000Z');
    const expiresAt = new Date(Date.now() + 60_000);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      steamId: '76561198000000000',
    });
    prisma.inventorySyncRun.findFirst.mockResolvedValue({
      userId: 'user-1',
      status: 'SUCCESS',
      itemCount: 1,
      fetchedAt,
      expiresAt,
      errorCode: null,
    });
    prisma.inventoryAsset.findMany.mockResolvedValue([
      {
        id: 'asset-1',
        itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
      },
    ]);

    const result = await service.getUserInventory('user-1');

    expect(inventoryProvider.syncInventory).not.toHaveBeenCalled();
    expect(result.sync.cacheHit).toBe(true);
    expect(result.sync.stale).toBe(false);
    expect(result.assets).toHaveLength(1);
  });

  it('returns stale cache and refreshes Steam in the background', async () => {
    const fetchedAt = new Date('2026-07-19T10:00:00.000Z');
    const expiresAt = new Date(Date.now() - 60_000);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      steamId: '76561198000000000',
    });
    prisma.inventorySyncRun.findFirst.mockResolvedValue({
      userId: 'user-1',
      status: 'SUCCESS',
      itemCount: 1,
      fetchedAt,
      expiresAt,
      errorCode: null,
    });
    prisma.inventoryAsset.findMany.mockResolvedValue([
      {
        id: 'asset-1',
        itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
      },
    ]);
    inventoryProvider.syncInventory.mockResolvedValue({
      status: 'SUCCESS',
      itemCount: 1,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      cacheHit: false,
      stale: false,
    });

    const result = await service.getUserInventory('user-1');

    expect(result.sync.stale).toBe(true);
    expect(result.sync.cacheHit).toBe(true);
    expect(inventoryProvider.syncInventory).toHaveBeenCalled();
  });

  it('returns steam and marketplace price hints keyed by market hash name', async () => {
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'AK-47 | Redline (Field-Tested)': {
        priceMinor: 1250,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
      'Fever Case': {
        priceMinor: 980,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
    });
    prisma.lot.findMany.mockResolvedValue([
      {
        priceMinor: 1100n,
        inventoryAsset: {
          itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
        },
      },
      {
        priceMinor: 900n,
        inventoryAsset: {
          itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
        },
      },
    ]);

    const result = await service.getPriceHints([
      'AK-47 | Redline (Field-Tested)',
      'Fever Case',
    ]);

    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledWith(
      ['AK-47 | Redline (Field-Tested)', 'Fever Case'],
      expect.objectContaining({ forceRefresh: false, cacheOnly: false }),
    );
    expect(prisma.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: LotStatus.ACTIVE,
        }),
      }),
    );
    expect(result.hints['AK-47 | Redline (Field-Tested)']).toEqual({
      steamPriceMinor: 1250,
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      minMarketplacePriceMinor: '900',
    });
    expect(result.hints['Fever Case']).toEqual({
      steamPriceMinor: 980,
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      minMarketplacePriceMinor: null,
    });
    expect(result.steamPriceFetchedAt).toBe('2026-07-11T12:00:00.000Z');
  });

  it('returns partial hints when Steam prices are unavailable for some items', async () => {
    steamMarketPrice.isEnabled.mockReturnValue(true);
    steamMarketPrice.getPricesWithMeta
      .mockResolvedValueOnce({
        'Fever Case': { priceMinor: null, fetchedAt: null },
      })
      .mockResolvedValueOnce({
        'Fever Case': { priceMinor: null, fetchedAt: null },
      });
    prisma.lot.findMany.mockResolvedValue([]);

    const result = await service.getPriceHints(['Fever Case']);

    expect(result.hints['Fever Case']).toEqual({
      steamPriceMinor: null,
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      minMarketplacePriceMinor: null,
    });
    expect(result.steamPriceMissing).toEqual(['Fever Case']);
  });

  it('passes cacheOnly through to the Steam price service', async () => {
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'Fever Case': { priceMinor: 500, fetchedAt: '2026-07-11T12:00:00.000Z' },
    });
    prisma.lot.findMany.mockResolvedValue([]);

    await service.getPriceHints(['Fever Case'], { cacheOnly: true });

    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledWith(
      ['Fever Case'],
      expect.objectContaining({ cacheOnly: true }),
    );
  });
});
