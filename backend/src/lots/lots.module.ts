import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { LotStateService } from './lot-state.service';
import { MyLotsController } from './my-lots.controller';

@Module({
  controllers: [LotsController, MyLotsController],
  providers: [LotsService, LotStateService],
  exports: [LotsService, LotStateService],
})
export class LotsModule {}
