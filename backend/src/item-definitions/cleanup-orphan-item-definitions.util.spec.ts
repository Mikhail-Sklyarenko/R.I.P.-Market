import { cleanupOrphanItemDefinitions } from '../item-definitions/cleanup-orphan-item-definitions.util';

describe('cleanupOrphanItemDefinitions', () => {
  it('deletes item definitions without inventory assets', async () => {
    const prisma = {
      itemDefinition: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'orphan-1' }, { id: 'orphan-2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const report = await cleanupOrphanItemDefinitions(prisma as never);

    expect(report).toEqual({ scanned: 2, deleted: 2 });
    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith({
      where: {
        catalogSeeded: false,
        assets: { none: {} },
        buyRequests: { none: {} },
      },
      select: { id: true },
    });
    expect(prisma.itemDefinition.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['orphan-1', 'orphan-2'] } },
    });
  });

  it('returns zero counts when nothing to delete', async () => {
    const prisma = {
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };

    const report = await cleanupOrphanItemDefinitions(prisma as never);

    expect(report).toEqual({ scanned: 0, deleted: 0 });
    expect(prisma.itemDefinition.deleteMany).not.toHaveBeenCalled();
  });
});
