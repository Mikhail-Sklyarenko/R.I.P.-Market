import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/**
 * Steam inventory rows must not disappear just because Steam was quiet.
 * `markMissingAssetsRemoved` already drops items after a successful full sync.
 */
@Injectable()
export class InventoryStaleCleanupService {
  private readonly logger = new Logger(InventoryStaleCleanupService.name);

  @Cron('0 */6 * * *')
  async cleanupStaleAssets(): Promise<void> {
    this.logger.debug(
      'Skipped age-based inventory wipe; items are removed only after a successful full Steam sync.',
    );
  }
}
