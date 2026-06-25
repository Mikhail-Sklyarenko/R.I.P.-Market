import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [WalletModule, LotsModule, OrdersModule],
  controllers: [TradesController],
  providers: [TradesService],
})
export class TradesModule {}
