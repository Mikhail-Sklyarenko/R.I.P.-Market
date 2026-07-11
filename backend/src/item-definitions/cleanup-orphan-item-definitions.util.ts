import type { PrismaService } from '../prisma/prisma.service';

export type OrphanItemCleanupReport = {
  scanned: number;
  deleted: number;
};

export async function cleanupOrphanItemDefinitions(
  prisma: Pick<PrismaService, 'itemDefinition'>,
): Promise<OrphanItemCleanupReport> {
  const orphans = await prisma.itemDefinition.findMany({
    where: { assets: { none: {} } },
    select: { id: true },
  });

  if (orphans.length === 0) {
    return { scanned: 0, deleted: 0 };
  }

  const result = await prisma.itemDefinition.deleteMany({
    where: { id: { in: orphans.map((entry) => entry.id) } },
  });

  return {
    scanned: orphans.length,
    deleted: result.count,
  };
}
