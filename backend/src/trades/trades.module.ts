import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { SettlementModule } from '../settlement/settlement.module';
import { TradesController } from './trades.controller';
import { TradeInventoryDeltaService } from './trade-inventory-delta.service';
import { TradeShadowComparatorService } from './trade-shadow-comparator.service';
import { TradeShadowMetricsService } from './trade-shadow-metrics.service';
import { TradeStatusPollerService } from './trade-status-poller.service';
import { TradesService } from './trades.service';

@Module({
  imports: [WalletModule, LotsModule, OrdersModule, SettlementModule],
  controllers: [TradesController],
  providers: [
    TradesService,
    TradeInventoryDeltaService,
    TradeStatusPollerService,
    TradeShadowComparatorService,
    TradeShadowMetricsService,
  ],
  exports: [
    TradesService,
    TradeStatusPollerService,
    TradeShadowComparatorService,
    TradeShadowMetricsService,
  ],
})
export class TradesModule {}
