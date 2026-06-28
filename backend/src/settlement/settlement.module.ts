import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { SettlementController } from './settlement.controller';
import { SettlementGuardService } from './settlement-guard.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [WalletModule, LotsModule, OrdersModule],
  controllers: [SettlementController],
  providers: [SettlementGuardService, SettlementService],
  exports: [SettlementGuardService, SettlementService],
})
export class SettlementModule {}
