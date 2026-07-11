import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryController } from './inventory.controller';
import { InventoryStaleCleanupService } from './inventory-stale-cleanup.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CatalogModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryStaleCleanupService],
  exports: [InventoryService],
})
export class InventoryModule {}
