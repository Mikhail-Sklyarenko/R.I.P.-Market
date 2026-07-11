import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { LotStateService } from './lot-state.service';
import { MyLotsController } from './my-lots.controller';

@Module({
  imports: [InventoryModule, UsersModule, CatalogModule],
  controllers: [LotsController, MyLotsController],
  providers: [LotsService, LotStateService],
  exports: [LotsService, LotStateService],
})
export class LotsModule {}
