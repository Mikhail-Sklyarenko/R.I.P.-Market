import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BuyRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BUY_REQUEST_TTL_DAYS } from './buy-request-matching.util';

@Injectable()
export class BuyRequestsExpiryService {
  private readonly logger = new Logger(BuyRequestsExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 4 * * *')
  async expireStaleBuyRequests(): Promise<void> {
    const cutoff = new Date(
      Date.now() - BUY_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.prisma.buyRequest.updateMany({
      where: {
        status: BuyRequestStatus.OPEN,
        createdAt: { lt: cutoff },
      },
      data: { status: BuyRequestStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale buy request(s)`);
    }
  }
}
