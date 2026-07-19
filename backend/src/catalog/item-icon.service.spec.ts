import { ItemIconService } from './item-icon.service';

describe('ItemIconService', () => {
  const prisma = {
    itemDefinition: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    lot: {
      findMany: jest.fn(),
    },
  };

  const service = new ItemIconService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STEAM_ITEM_ICON_ENABLED = 'true';
  });

  it('copies icons from listing snapshots onto empty definitions', async () => {
    prisma.lot.findMany.mockResolvedValue([
      {
        inventoryAsset: { itemDefinitionId: 'def-1' },
        listingSnapshot: { iconUrl: '-9a81dlW-redline' },
      },
      {
        inventoryAsset: { itemDefinitionId: 'def-1' },
        listingSnapshot: { iconUrl: '-9a81dlW-other' },
      },
    ]);
    prisma.itemDefinition.updateMany.mockResolvedValue({ count: 1 });

    const updated = await service.backfillFromListingSnapshots(['def-1']);

    expect(updated).toBe(1);
    expect(prisma.itemDefinition.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'def-1',
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      data: { iconUrl: '-9a81dlW-redline' },
    });
  });

  it('skips schedule when icons already present', () => {
    const spy = jest.spyOn(service, 'refreshMissingIcons');
    service.scheduleMissingIconRefresh([
      {
        id: 'def-1',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        iconUrl: '-9a81dlW',
      },
    ]);
    expect(spy).not.toHaveBeenCalled();
  });
});
