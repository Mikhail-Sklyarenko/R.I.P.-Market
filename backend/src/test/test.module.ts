import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { TestResetController } from './test-reset.controller';
import { TestRouteGuardService } from './test-route-guard.service';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [TestResetController],
  providers: [TestRouteGuardService],
})
export class TestModule {}
