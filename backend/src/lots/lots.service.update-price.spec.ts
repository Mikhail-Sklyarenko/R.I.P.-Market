import { LotsService } from './lots.service';
import { LotStatus } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';

describe('LotsService.updatePrice', () => {
  it('updates price fields for an ACTIVE lot owned by the seller', async () => {
    const updatedLot = {
      id: 'lot-1',
      sellerId: 'seller-1',
      status: LotStatus.ACTIVE,
      priceMinor: 1900n,
      commissionMinor: 95n,
      sellerReceiveMinor: 1805n,
      inventoryAsset: { itemDefinition: { marketHashName: 'AK-47 | Redline' } },
      listingSnapshot: null,
    };
    const prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lot-1',
          sellerId: 'seller-1',
          status: LotStatus.ACTIVE,
          priceMinor: 2000n,
          inventoryAsset: {
            itemDefinition: { marketHashName: 'AK-47 | Redline' },
          },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          lot: {
            update: jest.fn().mockResolvedValue(updatedLot),
          },
          lotStatusEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      }),
    };

    const buyRequestMatching = {
      matchLotActivated: jest.fn().mockResolvedValue(undefined),
    };

    const service = new LotsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      buyRequestMatching as never,
    );

    const result = await service.updatePrice('seller-1', 'lot-1', 1900);

    expect(result.priceMinor).toBe('1900');
    expect(buyRequestMatching.matchLotActivated).toHaveBeenCalledWith('lot-1');
  });

  it('rejects price updates when lot is not ACTIVE', async () => {
    const prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lot-1',
          sellerId: 'seller-1',
          status: LotStatus.RESERVED,
          priceMinor: 2000n,
          inventoryAsset: { itemDefinition: {} },
        }),
      },
    };
    const service = new LotsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { matchLotActivated: jest.fn() } as never,
    );

    await expect(service.updatePrice('seller-1', 'lot-1', 1900)).rejects.toMatchObject({
      code: ErrorCode.LOT_NOT_ACTIVE,
    });
  });
});
