import { ItemIconWarmerService } from './item-icon-warmer.service';
import { LotStatus } from '@prisma/client';

describe('ItemIconWarmerService', () => {
  const prisma = {
    lot: { findMany: jest.fn() },
    itemDefinition: { findMany: jest.fn() },
  };

  const itemIcons = {
    isEnabled: jest.fn().mockReturnValue(true),
    isSteamBlocked: jest.fn().mockReturnValue(false),
    backfillMissingFromSnapshots: jest.fn().mockResolvedValue(2),
    refreshMissingIcons: jest.fn().mockResolvedValue(1),
  };

  const service = new ItemIconWarmerService(
    prisma as never,
    itemIcons as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    itemIcons.isEnabled.mockReturnValue(true);
    itemIcons.isSteamBlocked.mockReturnValue(false);
    itemIcons.backfillMissingFromSnapshots.mockResolvedValue(2);
    itemIcons.refreshMissingIcons.mockResolvedValue(1);
    prisma.lot.findMany.mockResolvedValue([
      {
        inventoryAsset: {
          itemDefinition: {
            id: 'def-1',
            marketHashName: 'AK-47 | Redline (Field-Tested)',
          },
        },
      },
    ]);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'def-2',
        marketHashName: 'AWP | Asiimov (Battle-Scarred)',
      },
    ]);
  });

  it('runs snapshot backfill then steam refresh for missing defs', async () => {
    const updated = await service.warmMissingIcons('manual');

    expect(updated).toBe(3);
    expect(itemIcons.backfillMissingFromSnapshots).toHaveBeenCalled();
    expect(itemIcons.refreshMissingIcons).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'def-1' }),
        expect.objectContaining({ id: 'def-2' }),
      ]),
    );
    expect(prisma.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: LotStatus.ACTIVE }),
      }),
    );
  });

  it('skips when Steam is blocked', async () => {
    itemIcons.isSteamBlocked.mockReturnValue(true);
    await expect(service.warmMissingIcons('cron')).resolves.toBe(0);
    expect(itemIcons.backfillMissingFromSnapshots).not.toHaveBeenCalled();
  });
});
