import { LotStatus, OrderStatus } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildLotListingSnapshotData } from '../lots/lot-listing-snapshot.util';
import { PrismaService } from '../prisma/prisma.service';

type BackfillReport = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const report = await backfillListingSnapshots(prisma);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

export async function backfillListingSnapshots(
  prisma: PrismaService,
): Promise<BackfillReport> {
  const lots = await prisma.lot.findMany({
    where: {
      listingSnapshot: null,
      OR: [
        { status: { in: [LotStatus.ACTIVE, LotStatus.RESERVED] } },
        {
          orders: {
            some: {
              status: {
                in: [
                  OrderStatus.WAITING_TRADE,
                  OrderStatus.TRADE_CONFIRMED,
                  OrderStatus.SETTLEMENT_HOLD,
                ],
              },
            },
          },
        },
      ],
    },
    include: {
      inventoryAsset: { include: { itemDefinition: true } },
      seller: { select: { steamId: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const report: BackfillReport = {
    scanned: lots.length,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  for (const lot of lots) {
    if (!lot.inventoryAsset || !lot.seller?.steamId) {
      report.skipped += 1;
      continue;
    }

    const snapshotData = buildLotListingSnapshotData(
      lot.inventoryAsset,
      lot.seller.steamId,
    );
    const existing = await prisma.lotListingSnapshot.findUnique({
      where: { lotId: lot.id },
    });

    await prisma.lotListingSnapshot.upsert({
      where: { lotId: lot.id },
      create: {
        lotId: lot.id,
        ...snapshotData,
      },
      update: snapshotData,
    });

    if (existing) {
      report.updated += 1;
    } else {
      report.created += 1;
    }
  }

  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
