import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getSettlementReleaseBatchSize,
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
    // Disabling real settlement pauses releases, including existing holds.
    await this.releaseDueHolds();
  }

  async releaseDueHolds(): Promise<{ scanned: number; released: number }> {
    if (this.processing || process.env.ENABLE_REAL_SETTLEMENT !== 'true') {
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
            settlementReleasedAt: null,
            settlementHoldUntil: { lte: new Date() },
          },
          tradeOperation: {
            verificationStage: { not: 'MANUAL_REVIEW' },
            OR: [
              { nextVerificationAt: null },
              { nextVerificationAt: { lte: new Date() } },
            ],
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
          } else if (
            !result.guard.allowed &&
            ['STEAM_RECHECK_UNAVAILABLE', 'STEAM_REVERSAL_DETECTED'].includes(
              result.guard.code,
            )
          ) {
            const operation = await this.prisma.tradeOperation.findUnique({
              where: { orderId: order.id },
            });
            if (operation) {
              const exhausted =
                operation.checkCount >= 20 ||
                result.guard.code === 'STEAM_REVERSAL_DETECTED';
              await this.prisma.tradeOperation.updateMany({
                where: {
                  id: operation.id,
                  order: { status: OrderStatus.SETTLEMENT_HOLD },
                },
                data: {
                  checkCount: { increment: 1 },
                  verificationStage: exhausted
                    ? 'MANUAL_REVIEW'
                    : 'PROTECTION_RECHECK',
                  failReasonCode: result.guard.code,
                  nextVerificationAt: new Date(
                    Date.now() +
                      Math.min(
                        3_600_000,
                        60_000 * 2 ** Math.min(operation.checkCount, 6),
                      ),
                  ),
                },
              });
              this.logger.warn(
                JSON.stringify({
                  event: exhausted
                    ? 'delivery_verification_manual_review'
                    : 'settlement_release_recheck',
                  orderId: order.id,
                  reasonCode: result.guard.code,
                }),
              );
            }
          }
        } catch {
          this.logger.error(
            JSON.stringify({
              event: 'settlement_release_failed',
              metric: 'settlement_release_failed_total',
              alert: true,
              orderId: order.id,
              error: 'SETTLEMENT_RELEASE_UNAVAILABLE',
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
