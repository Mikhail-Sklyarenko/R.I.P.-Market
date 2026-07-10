import { Module } from '@nestjs/common';
import { ExtensionRolloutModule } from '../extension/extension-rollout.module';
import { LotsModule } from '../lots/lots.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { TradeOperationStateService } from '../trades/trade-operation-state.service';
import { TradeReferenceReconcileService } from '../trades/trade-reference-reconcile.service';
import { MyOrdersController } from './my-orders.controller';
import { OrderStateService } from './order-state.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [WalletModule, LotsModule, ExtensionRolloutModule, UsersModule],
  controllers: [OrdersController, MyOrdersController],
  providers: [
    OrdersService,
    OrderStateService,
    TradeOperationStateService,
    TradeReferenceReconcileService,
  ],
  exports: [
    OrdersService,
    OrderStateService,
    TradeOperationStateService,
    TradeReferenceReconcileService,
  ],
})
export class OrdersModule {}
