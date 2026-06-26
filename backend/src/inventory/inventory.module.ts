import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryStaleCleanupService } from './inventory-stale-cleanup.service';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryStaleCleanupService],
  exports: [InventoryService],
})
export class InventoryModule {}
