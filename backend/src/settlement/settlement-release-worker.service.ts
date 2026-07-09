import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getSettlementReleaseBatchSize,
  isSettlementHoldWindowEnabled,
  settlementHoldReleaseIdempotencyKey,
} from './settlement-hold.config';
import { SettlementService } from './settlement.service';

@Injectable()
export class SettlementReleaseWorkerService {
  private readonly logger = new Logger(SettlementReleaseWorkerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  @Interval(60_000)
  async handleInterval(): Promise<void> {
    if (
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.ENABLE_TEST_ROUTES === 'true'
    ) {
      return;
    }
    if (!isSettlementHoldWindowEnabled()) {
      return;
    }
    await this.releaseDueHolds();
  }

  async releaseDueHolds(): Promise<{ scanned: number; released: number }> {
    if (this.processing) {
      return { scanned: 0, released: 0 };
    }

    this.processing = true;
    let scanned = 0;
    let released = 0;

    try {
      const orders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.SETTLEMENT_HOLD,
          hold: {
            settlementHoldUntil: { lte: new Date() },
            settlementReleasedAt: null,
          },
        },
        select: { id: true },
        take: getSettlementReleaseBatchSize(),
        orderBy: { updatedAt: 'asc' },
      });

      for (const order of orders) {
        scanned += 1;
        try {
          const result = await this.settlementService.releaseDueSettlementHold(
            order.id,
            settlementHoldReleaseIdempotencyKey(order.id),
          );
          if (result.settled) {
            released += 1;
          }
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: 'settlement_release_failed',
              metric: 'settlement_release_failed_total',
              alert: true,
              orderId: order.id,
              error: error instanceof Error ? error.message : 'unknown',
            }),
          );
        }
      }
    } finally {
      this.processing = false;
    }

    if (scanned > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'settlement_release_batch',
          scanned,
          released,
        }),
      );
    }

    return { scanned, released };
  }
}
