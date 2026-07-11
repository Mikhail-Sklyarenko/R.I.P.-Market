import { InventoryAssetStatus } from '@prisma/client';
import { TradeInventoryDeltaService } from './trade-inventory-delta.service';

describe('TradeInventoryDeltaService', () => {
  const prisma = {
    inventoryAsset: {
      findFirst: jest.fn(),
    },
  };
  const inventoryProvider = {
    syncInventory: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
  };
  const service = new TradeInventoryDeltaService(
    prisma as never,
    inventoryProvider as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('force-syncs both inventories during verification', async () => {
    prisma.inventoryAsset.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.verify(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
      { force: true },
    );

    expect(inventoryProvider.syncInventory).toHaveBeenCalledWith(
      'seller-1',
      'seller-steam',
      { force: true },
    );
    expect(inventoryProvider.syncInventory).toHaveBeenCalledWith(
      'buyer-1',
      'buyer-steam',
      { force: true },
    );
  });

  it('confirms when buyer received item by market hash name after seller released it', async () => {
    prisma.inventoryAsset.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ownerId: 'buyer-1',
        status: InventoryAssetStatus.AVAILABLE,
      });

    const result = await service.verify(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
    );

    expect(result).toBe('confirmed');
  });

  it('does not treat reserved listing asset as seller still holding live inventory', async () => {
    prisma.inventoryAsset.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await service.verify(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
    );

    expect(result).toBe('pending');
    expect(prisma.inventoryAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: InventoryAssetStatus.AVAILABLE,
        }),
      }),
    );
  });

  it('returns unknown when steam ids are missing', async () => {
    const result = await service.verify(
      'seller-1',
      'buyer-1',
      null,
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
    );

    expect(result).toBe('unknown');
    expect(inventoryProvider.syncInventory).not.toHaveBeenCalled();
  });
});
