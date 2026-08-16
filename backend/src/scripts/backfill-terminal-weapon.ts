/**
 * Remap Armory terminals from generic Crate → Terminal so the Cases tab can filter them.
 *
 * Usage (from backend/):
 *   npm run backfill:terminal-weapon
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
    await pool.end();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
