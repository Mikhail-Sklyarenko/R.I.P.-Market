import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TradeShadowMetricsService } from './trade-shadow-metrics.service';

export type VerificationSnapshotSource = 'STEAM_POLL' | 'MOCK_MANUAL';

export type RecordSnapshotParams = {
  orderId: string;
  source: VerificationSnapshotSource;
  observedStatus: string;
  expectedStatus?: string | null;
  payload?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
};

@Injectable()
export class TradeShadowComparatorService {
  private readonly logger = new Logger(TradeShadowComparatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: TradeShadowMetricsService,
  ) {}

  async recordSnapshot(params: RecordSnapshotParams) {
    const db = params.tx ?? this.prisma;
    const expectedStatus =
      params.expectedStatus !== undefined
        ? params.expectedStatus
        : await this.deriveExpectedStatus(params.orderId, params.source, db);

    const match =
      expectedStatus === null || expectedStatus === undefined
        ? true
        : params.observedStatus === expectedStatus;

    const snapshot = await db.tradeVerificationSnapshot.create({
      data: {
        orderId: params.orderId,
        source: params.source,
        observedStatus: params.observedStatus,
        expectedStatus,
        match,
        payload: params.payload ?? {},
      },
    });

    if (!match) {
      this.metrics.recordMismatch();
      await this.emitMismatchEvent(params.orderId, snapshot, db);
    }

    return snapshot;
  }

  async getLatestSteamObserved(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const db = tx ?? this.prisma;
    const latest = await db.tradeVerificationSnapshot.findFirst({
      where: { orderId, source: 'STEAM_POLL' },
      orderBy: { createdAt: 'desc' },
      select: { observedStatus: true },
    });
    return latest?.observedStatus ?? null;
  }

  async listSnapshots(orderId: string, take = 50) {
    return this.prisma.tradeVerificationSnapshot.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async countMismatchesLast7Days(): Promise<number> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.prisma.tradeVerificationSnapshot.count({
      where: { match: false, createdAt: { gte: since } },
    });
  }

  private async deriveExpectedStatus(
    orderId: string,
    source: VerificationSnapshotSource,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<string | null> {
    if (source === 'MOCK_MANUAL') {
      return this.getLatestSteamObserved(orderId, db);
    }

    return null;
  }

  private async emitMismatchEvent(
    orderId: string,
    snapshot: {
      id: string;
      source: string;
      observedStatus: string;
      expectedStatus: string | null;
    },
    db: Prisma.TransactionClient | PrismaService,
  ) {
    this.logger.warn(
      `Shadow verification mismatch for order ${orderId}: observed=${snapshot.observedStatus} expected=${snapshot.expectedStatus}`,
    );

    await db.outboxEvent.create({
      data: {
        eventType: 'TRADE_SHADOW_MISMATCH',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          orderId,
          snapshotId: snapshot.id,
          source: snapshot.source,
          observedStatus: snapshot.observedStatus,
          expectedStatus: snapshot.expectedStatus,
        },
      },
    });
  }
}
