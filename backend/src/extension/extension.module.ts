import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { DisputesModule } from '../disputes/disputes.module';
import { TradesModule } from '../trades/trades.module';
import { ExtensionController } from './extension.controller';
import { ExtensionSecurityService } from './extension-security.service';
import { ExtensionTradeTaskService } from './extension-trade-task.service';
import { ExtensionTradeAckService } from './extension-trade-ack.service';
import { ExtensionSessionGuard } from './guards/extension-session.guard';
import { ExtensionSignatureGuard } from './guards/extension-signature.guard';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => OrdersModule),
    DisputesModule,
    forwardRef(() => TradesModule),
  ],
  controllers: [ExtensionController],
  providers: [
    ExtensionSecurityService,
    ExtensionTradeTaskService,
    ExtensionTradeAckService,
    ExtensionSessionGuard,
    ExtensionSignatureGuard,
  ],
  exports: [ExtensionTradeTaskService, ExtensionTradeAckService],
})
export class ExtensionModule {}
