/**
 * Import full CS2 catalog cards from ByMykel CSGO-API (skins + stickers + crates + …).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts --offset=0 --limit=500
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-cs2-catalog.ts --sources=sticker,crate
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  buildCatalogCardSeeds,
  CS2_CATALOG_SOURCES,
  importCs2CatalogSeeds,
  mergeCatalogCardSeeds,
  type Cs2ApiCatalogRow,
  type Cs2CatalogSource,
  type CatalogSkinCardSeed,
} from '../item-definitions/import-cs2-catalog.util';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function resolveSources(): Cs2CatalogSource[] {
  const raw = readArg('sources');
  if (!raw?.trim()) {
    return [...CS2_CATALOG_SOURCES];
  }
  const wanted = new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  const selected = CS2_CATALOG_SOURCES.filter((source) => wanted.has(source.id));
  if (selected.length === 0) {
    throw new Error(
      `No sources matched --sources=${raw}. Valid: ${CS2_CATALOG_SOURCES.map((s) => s.id).join(',')}`,
    );
  }
  return selected;
}

async function fetchSourceRows(
  source: Cs2CatalogSource,
): Promise<{ source: Cs2CatalogSource; rows: Cs2ApiCatalogRow[] }> {
  console.log(`Fetching ${source.id}: ${source.url}`);
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.id}: HTTP ${response.status}`);
  }
  const rows = (await response.json()) as Cs2ApiCatalogRow[];
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected payload for ${source.id}: expected array`);
  }
  return { source, rows };
}

async function main() {
  const offset = Number(readArg('offset') ?? '0');
  const limitRaw = readArg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const dryRun = hasFlag('dry-run');
  const sources = resolveSources();

  const fetched = await Promise.all(sources.map((source) => fetchSourceRows(source)));
  const batches: CatalogSkinCardSeed[][] = [];
  const bySource: Record<string, number> = {};

  for (const { source, rows } of fetched) {
    const seeds = buildCatalogCardSeeds(rows, source);
    bySource[source.id] = seeds.length;
    batches.push(seeds);
    console.log(
      `  ${source.id}: ${rows.length} rows → ${seeds.length} catalog cards`,
    );
  }

  const seeds = mergeCatalogCardSeeds(batches);
  console.log(
    `Merged → ${seeds.length} unique catalog cards from ${sources.length} sources`,
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
    console.log(JSON.stringify({ ...report, bySource }, null, 2));
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
    console.log(JSON.stringify({ ...report, bySource }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
