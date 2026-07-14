import { Module, forwardRef } from '@nestjs/common';
import { TradesModule } from '../trades/trades.module';
import { ExtensionTradeAckService } from './extension-trade-ack.service';

/**
 * Isolated ack module so OrdersModule can acknowledge without importing
 * the full ExtensionModule (which pulls DisputesModule and creates a cycle).
 */
@Module({
  imports: [forwardRef(() => TradesModule)],
  providers: [ExtensionTradeAckService],
  exports: [ExtensionTradeAckService],
})
export class ExtensionTradeAckModule {}
