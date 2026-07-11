import { LotStatus } from '@prisma/client';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const prisma = {
    itemDefinition: {
      findMany: jest.fn(),
    },
    lot: {
      findMany: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
  };

  const steamMarketPrice = {
    getPricesMinor: jest.fn(),
    getPricesWithMeta: jest.fn(),
  };

  const service = new CatalogService(prisma as never, steamMarketPrice as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue([]);
    steamMarketPrice.getPricesMinor.mockResolvedValue({});
  });

  it('returns only item definitions with active lots', async () => {
    prisma.lot.findMany.mockImplementation((args: { select?: unknown }) => {
      if (args.select && 'priceMinor' in (args.select as object)) {
        return Promise.resolve([
          {
            priceMinor: 1000n,
            inventoryAsset: { itemDefinitionId: 'item-listed' },
          },
        ]);
      }
      if (args.select && 'id' in (args.select as object)) {
        return Promise.resolve([
          {
            id: 'lot-1',
            inventoryAsset: { itemDefinitionId: 'item-listed' },
          },
        ]);
      }
      return Promise.resolve([
        {
          inventoryAsset: { itemDefinitionId: 'item-listed' },
        },
      ]);
    });
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-listed',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
      },
    ]);
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'AK-47 | Redline (Field-Tested)': {
        priceMinor: 1250,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
    });
    steamMarketPrice.getPricesMinor.mockResolvedValue({
      'AK-47 | Redline (Field-Tested)': 1250,
    });

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(prisma.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: LotStatus.ACTIVE,
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'item-listed',
      activeLotCount: 1,
      featuredLotId: 'lot-1',
    });
  });

  it('returns empty catalog when no active lots match filters', async () => {
    prisma.lot.findMany.mockResolvedValue([]);

    const result = await service.listItems({ page: 1, limit: 24, weapon: 'Knife' });

    expect(prisma.itemDefinition.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 24,
      steamPriceFetchedAt: null,
    });
  });
});
