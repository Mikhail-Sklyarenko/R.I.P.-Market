/**
 * One-shot / cron-friendly backfill for ItemDefinition.iconUrl.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-item-icons.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-item-icons.ts --limit=50
 */
import { PrismaClient } from '@prisma/client';
import { ItemIconService } from '../catalog/item-icon.service';

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = Math.min(
    Math.max(Number(limitArg?.split('=')[1] ?? 40) || 40, 1),
    200,
  );

  const prisma = new PrismaClient();
  const icons = new ItemIconService(prisma as never);

  try {
    const missing = await prisma.itemDefinition.findMany({
      where: {
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      select: { id: true, marketHashName: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    if (missing.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No ItemDefinition rows missing iconUrl');
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`Refreshing icons for ${missing.length} definition(s)…`);
    const fromSnapshots = await icons.backfillMissingFromSnapshots(limit);
    const updated = await icons.refreshMissingIcons(missing);
    // eslint-disable-next-line no-console
    console.log(
      `Updated ${fromSnapshots + updated} icon(s) (snapshots=${fromSnapshots}, steam=${updated})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
