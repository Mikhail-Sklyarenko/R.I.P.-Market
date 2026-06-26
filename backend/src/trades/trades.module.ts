import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { TradesController } from './trades.controller';
import { TradeInventoryDeltaService } from './trade-inventory-delta.service';
import { TradeStatusPollerService } from './trade-status-poller.service';
import { TradesService } from './trades.service';

@Module({
  imports: [WalletModule, LotsModule, OrdersModule],
  controllers: [TradesController],
  providers: [
    TradesService,
    TradeInventoryDeltaService,
    TradeStatusPollerService,
  ],
  exports: [TradesService, TradeStatusPollerService],
})
export class TradesModule {}
