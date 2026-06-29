import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InventoryAssetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryStaleCleanupService {
  private readonly logger = new Logger(InventoryStaleCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */6 * * *')
  async cleanupStaleAssets(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.inventoryAsset.updateMany({
      where: {
        status: InventoryAssetStatus.AVAILABLE,
        updatedAt: { lt: cutoff },
        lot: null,
      },
      data: {
        status: InventoryAssetStatus.REMOVED,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Marked ${result.count} stale inventory assets as REMOVED`,
      );
    }
  }
}
