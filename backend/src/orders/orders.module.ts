import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { WalletModule } from '../wallet/wallet.module';
import { MyOrdersController } from './my-orders.controller';
import { OrderStateService } from './order-state.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [WalletModule, LotsModule],
  controllers: [OrdersController, MyOrdersController],
  providers: [OrdersService, OrderStateService],
  exports: [OrdersService, OrderStateService],
})
export class OrdersModule {}
