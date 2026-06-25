import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Interval(10000)
  async handleInterval(): Promise<void> {
    if (process.env.JEST_WORKER_ID !== undefined) {
      return;
    }
    await this.processPending();
  }

  async processPending(): Promise<{ processed: number; failed: number }> {
    if (this.processing) {
      return { processed: 0, failed: 0 };
    }

    this.processing = true;
    let processed = 0;
    let failed = 0;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const event of events) {
        try {
          await this.notificationsService.createFromOutboxEvent(
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            event.payload,
          );

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
              nextRetryAt: null,
            },
          });
          processed += 1;
        } catch (error) {
          failed += 1;
          const nextRetry = event.retryCount + 1;
          const isDead = nextRetry >= MAX_RETRIES;

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: isDead ? 'DEAD' : 'PENDING',
              retryCount: nextRetry,
              nextRetryAt: isDead
                ? null
                : new Date(Date.now() + this.backoffMs(nextRetry)),
            },
          });

          this.logger.warn(
            `Failed to process outbox event ${event.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    } finally {
      this.processing = false;
    }

    return { processed, failed };
  }

  private backoffMs(retryCount: number): number {
    return Math.min(60_000, 2_000 * 2 ** retryCount);
  }
}
