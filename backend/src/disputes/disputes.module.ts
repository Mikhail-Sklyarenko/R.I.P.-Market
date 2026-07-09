import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { DisputeFinancialGuardService } from './dispute-financial-guard.service';
import { DisputeOpsService } from './dispute-ops.service';

@Module({
  imports: [OrdersModule, LotsModule],
  providers: [DisputeOpsService, DisputeFinancialGuardService],
  exports: [DisputeOpsService, DisputeFinancialGuardService],
})
export class DisputesModule {}
