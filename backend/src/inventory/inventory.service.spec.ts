import { LotStatus } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const prisma = {
    lot: {
      findMany: jest.fn(),
    },
  };

  const steamMarketPrice = {
    getPricesMinor: jest.fn(),
    getPricesWithMeta: jest.fn(),
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

  it('returns steam and marketplace price hints keyed by market hash name', async () => {
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'AK-47 | Redline (Field-Tested)': { priceMinor: 1250, fetchedAt: '2026-07-11T12:00:00.000Z' },
      'Fever Case': { priceMinor: null, fetchedAt: null },
    });
    steamMarketPrice.getPricesMinor.mockResolvedValue({
      'AK-47 | Redline (Field-Tested)': 1250,
      'Fever Case': null,
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

    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledWith([
      'AK-47 | Redline (Field-Tested)',
      'Fever Case',
    ]);
    expect(prisma.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: LotStatus.ACTIVE,
        }),
      }),
    );
    expect(result.hints['AK-47 | Redline (Field-Tested)']).toEqual({
      steamPriceMinor: 1250,
      minMarketplacePriceMinor: '900',
    });
    expect(result.hints['Fever Case']).toEqual({
      steamPriceMinor: null,
      minMarketplacePriceMinor: null,
    });
    expect(result.steamPriceFetchedAt).toBe('2026-07-11T12:00:00.000Z');
  });
});
