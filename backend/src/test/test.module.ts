import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { TestResetController } from './test-reset.controller';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [TestResetController],
})
export class TestModule {}
