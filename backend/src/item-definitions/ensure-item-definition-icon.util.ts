import type { Prisma } from '@prisma/client';

type PrismaClientLike = {
  itemDefinition: {
    updateMany: (
      args: Prisma.ItemDefinitionUpdateManyArgs,
    ) => Promise<{ count: number }>;
  };
};

/**
 * Persist iconUrl onto ItemDefinition only when currently empty.
 * Safe to call from listing / inventory write paths.
 */
export async function ensureItemDefinitionIcon(
  prisma: PrismaClientLike,
  itemDefinitionId: string,
  iconUrl: string | null | undefined,
): Promise<boolean> {
  const trimmed = iconUrl?.trim();
  if (!trimmed) {
    return false;
  }

  const result = await prisma.itemDefinition.updateMany({
    where: {
      id: itemDefinitionId,
      OR: [{ iconUrl: null }, { iconUrl: '' }],
    },
    data: { iconUrl: trimmed },
  });
  return result.count > 0;
}
