import { LotStatus } from '@prisma/client';
import { backfillListingSnapshots } from './backfill-lot-listing-snapshots';

describe('backfillListingSnapshots', () => {
  it('creates snapshots for active lots without listing snapshot', async () => {
    const prisma = {
      lot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lot-1',
            seller: { steamId: '76561198000000000' },
            inventoryAsset: {
              assetExternalId: 'asset-1',
              floatValue: '0.25',
              paintSeed: 42,
              wear: 'FT',
              tradable: true,
              marketable: true,
              stickers: [],
              itemDefinition: {
                marketHashName: 'AK-47 | Redline (Field-Tested)',
                weapon: 'AK-47',
                rarity: 'Classified',
                iconUrl: null,
              },
            },
          },
        ]),
      },
      lotListingSnapshot: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await backfillListingSnapshots(prisma as never);

    expect(report).toEqual({
      scanned: 1,
      created: 1,
      updated: 0,
      skipped: 0,
    });
    expect(prisma.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listingSnapshot: null,
          OR: expect.arrayContaining([
            { status: { in: [LotStatus.ACTIVE, LotStatus.RESERVED] } },
          ]),
        }),
      }),
    );
  });
});
