import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SettlementModule } from '../settlement/settlement.module';
import { DisputesModule } from '../disputes/disputes.module';
import { ExtensionRolloutModule } from '../extension/extension-rollout.module';
import { TradesModule } from '../trades/trades.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    WalletModule,
    LotsModule,
    OrdersModule,
    OutboxModule,
    TradesModule,
    SettlementModule,
    DisputesModule,
    ExtensionRolloutModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}
