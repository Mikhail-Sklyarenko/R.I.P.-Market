import { ensureItemDefinitionIcon } from './ensure-item-definition-icon.util';

describe('ensureItemDefinitionIcon', () => {
  it('skips blank icons', async () => {
    const prisma = {
      itemDefinition: { updateMany: jest.fn() },
    };
    await expect(
      ensureItemDefinitionIcon(prisma as never, 'def-1', '  '),
    ).resolves.toBe(false);
    expect(prisma.itemDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('writes icon only when definition is empty', async () => {
    const prisma = {
      itemDefinition: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await expect(
      ensureItemDefinitionIcon(prisma as never, 'def-1', '-9a81dlW'),
    ).resolves.toBe(true);
    expect(prisma.itemDefinition.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'def-1',
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      data: { iconUrl: '-9a81dlW' },
    });
  });
});
