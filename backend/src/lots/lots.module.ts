import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { LotStateService } from './lot-state.service';
import { MyLotsController } from './my-lots.controller';

@Module({
  imports: [InventoryModule],
  controllers: [LotsController, MyLotsController],
  providers: [LotsService, LotStateService],
  exports: [LotsService, LotStateService],
})
export class LotsModule {}
