import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LotsModule } from '../lots/lots.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { DevTradeResetService } from './dev-trade-reset.service';
import { TestResetController } from './test-reset.controller';

@Module({
  imports: [WalletModule, AuthModule, OrdersModule, LotsModule],
  controllers: [TestResetController],
  providers: [DevTradeResetService],
})
export class TestModule {}
