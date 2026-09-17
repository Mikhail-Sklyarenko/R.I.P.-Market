import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { DevTradeResetController } from './dev-trade-reset.controller';
import { DevTradeResetService } from './dev-trade-reset.service';

@Module({
  imports: [AuthModule, OrdersModule, WalletModule],
  controllers: [DevTradeResetController],
  providers: [DevTradeResetService],
})
export class DevTradeResetModule {}
