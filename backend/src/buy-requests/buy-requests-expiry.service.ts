import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BuyRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BUY_REQUEST_TTL_DAYS } from './buy-request-matching.util';
import { BuyRequestsService } from './buy-requests.service';

@Injectable()
export class BuyRequestsExpiryService {
  private readonly logger = new Logger(BuyRequestsExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buyRequestsService: BuyRequestsService,
  ) {}

  @Cron('15 4 * * *')
  async expireStaleBuyRequests(): Promise<void> {
    const cutoff = new Date(
      Date.now() - BUY_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const stale = await this.prisma.buyRequest.findMany({
      where: {
        status: BuyRequestStatus.OPEN,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const request of stale) {
      try {
        await this.buyRequestsService.releaseHoldForExpired(request.id);
      } catch (error) {
        this.logger.warn(
          `Failed to expire buy request ${request.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (stale.length > 0) {
      this.logger.log(`Expired ${stale.length} stale buy request(s)`);
    }
  }
}
