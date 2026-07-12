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
    isEnabled: jest.fn().mockReturnValue(true),
  };

  const inventoryProvider = {
    syncInventory: jest.fn(),
  };

  const referencePrice = {
    getPricesWithMeta: jest.fn(),
  };

  const service = new InventoryService(
    prisma as never,
    inventoryProvider as never,
    steamMarketPrice as never,
    referencePrice as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    referencePrice.getPricesWithMeta.mockResolvedValue({});
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
      expect.objectContaining({ forceRefresh: true }),
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

  it('throws when Steam prices are unavailable for any requested item', async () => {
    steamMarketPrice.isEnabled.mockReturnValue(true);
    steamMarketPrice.getPricesWithMeta
      .mockResolvedValueOnce({
        'Fever Case': { priceMinor: null, fetchedAt: null },
      })
      .mockResolvedValueOnce({
        'Fever Case': { priceMinor: null, fetchedAt: null },
      });

    await expect(service.getPriceHints(['Fever Case'])).rejects.toMatchObject({
      code: 'STEAM_PRICE_UNAVAILABLE',
    });
  });
});
