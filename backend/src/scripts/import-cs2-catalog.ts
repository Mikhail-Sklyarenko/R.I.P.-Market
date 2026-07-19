/**
 * Import CS2 catalog skin cards from ByMykel CSGO-API (batched).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts --offset=0 --limit=500
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  buildCatalogSkinCardSeeds,
  CS2_SKINS_NOT_GROUPED_URL,
  importCs2CatalogSeeds,
  type Cs2ApiSkinRow,
} from '../item-definitions/import-cs2-catalog.util';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const offset = Number(readArg('offset') ?? '0');
  const limitRaw = readArg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const dryRun = hasFlag('dry-run');

  console.log(`Fetching ${CS2_SKINS_NOT_GROUPED_URL}`);
  const response = await fetch(CS2_SKINS_NOT_GROUPED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch skins: HTTP ${response.status}`);
  }
  const rows = (await response.json()) as Cs2ApiSkinRow[];
  const seeds = buildCatalogSkinCardSeeds(rows);
  console.log(
    `Fetched ${rows.length} Steam variants → ${seeds.length} catalog cards`,
  );

  if (dryRun) {
    const report = await importCs2CatalogSeeds(
      {
        itemDefinition: {
          upsert: async () => null as unknown,
        },
      },
      seeds,
      { offset, limit, dryRun: true },
    );
    console.log(JSON.stringify(report, null, 2));
    console.log('Sample:', seeds.slice(offset, offset + Math.min(3, limit ?? 3)));
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const report = await importCs2CatalogSeeds(prisma, seeds, {
      offset,
      limit,
      dryRun: false,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
