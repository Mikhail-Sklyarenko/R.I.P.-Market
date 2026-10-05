import { SteamOrderVerificationService } from './steam-order-verification.service';
import { SettlementModule } from '../settlement/settlement.module';
import { SteamOrderVerificationController } from './steam-order-verification.controller';
import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { DisputesModule } from '../disputes/disputes.module';
import { TradesModule } from '../trades/trades.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ExtensionController } from './extension.controller';
import { SteamAuthProbeController } from './steam-auth-probe.controller';
import { SteamAuthProbeService } from './steam-auth-probe.service';
import { ExtensionSecurityModule } from './extension-security.module';
import { ExtensionTradeTaskService } from './extension-trade-task.service';
import { ExtensionTradeAckModule } from './extension-trade-ack.module';
import { ExtensionSessionGuard } from './guards/extension-session.guard';
import { ExtensionSignatureGuard } from './guards/extension-signature.guard';

@Module({
  imports: [
    forwardRef(() => SettlementModule),
    AuthModule,
    ExtensionSecurityModule,
    InventoryModule,
    forwardRef(() => OrdersModule),
    DisputesModule,
    forwardRef(() => TradesModule),
    ExtensionTradeAckModule,
  ],
  controllers: [
    ExtensionController,
    SteamAuthProbeController,
    SteamOrderVerificationController,
  ],
  providers: [
    SteamAuthProbeService,
    SteamOrderVerificationService,
    ExtensionTradeTaskService,
    ExtensionSessionGuard,
    ExtensionSignatureGuard,
  ],
  exports: [
    ExtensionTradeTaskService,
    ExtensionTradeAckModule,
    ExtensionSecurityModule,
  ],
})
export class ExtensionModule {}
