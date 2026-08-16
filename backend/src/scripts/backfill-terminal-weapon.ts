/**
 * Remap Armory terminals from generic Crate → Terminal so the Cases tab can filter them.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-terminal-weapon.ts
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.itemDefinition.updateMany({
      where: {
        game: 'CS2',
        marketHashName: { endsWith: ' Terminal', mode: 'insensitive' },
        NOT: { weapon: { equals: 'Terminal', mode: 'insensitive' } },
      },
      data: { weapon: 'Terminal' },
    });
    // eslint-disable-next-line no-console
    console.log(`Updated ${result.count} ItemDefinition row(s) to weapon=Terminal`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
