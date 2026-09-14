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
    jest.resetAllMocks();
    inventoryProvider.syncInventory.mockResolvedValue({ status: 'SUCCESS' });
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

  it('does not confirm a matching name from a different transfer', async () => {
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

    expect(result).toBe('pending');
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

  it('does not confirm a fungible item merely first synced after order creation', async () => {
    const orderCreatedAt = new Date('2026-07-12T10:00:00.000Z');

    prisma.inventoryAsset.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ownerId: 'buyer-1',
        status: InventoryAssetStatus.AVAILABLE,
        createdAt: new Date('2026-07-12T10:05:00.000Z'),
      });

    const result = await service.verify(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'old-case-asset-id',
      'Revolution Case',
      { orderCreatedAt },
    );

    expect(result).toBe('pending');
    expect(prisma.inventoryAsset.findFirst).toHaveBeenCalledTimes(2);
  });

  it('confirms exact asset proof and rejects conflicting ownership', async () => {
    prisma.inventoryAsset.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'exact' });
    expect(await service.verify('s', 'b', 'ss', 'bs', 'asset', 'name')).toBe('confirmed');
    prisma.inventoryAsset.findFirst.mockResolvedValueOnce({ id: 'seller' }).mockResolvedValueOnce({ id: 'buyer' });
    expect(await service.verify('s', 'b', 'ss', 'bs', 'asset', 'name')).toBe('seller_still_holds');
  });

  it('returns unknown when steam ids are missing' , async () => {
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

  it('returns unknown when inventory sync is failed or stale', async () => {
    inventoryProvider.syncInventory
      .mockResolvedValueOnce({ status: 'FAILED', stale: true })
      .mockResolvedValueOnce({ status: 'SUCCESS', stale: false });

    const result = await service.verify(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
      { force: true },
    );

    expect(result).toBe('unknown');
    expect(prisma.inventoryAsset.findFirst).not.toHaveBeenCalled();
  });
});
