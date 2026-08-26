import { Module, forwardRef } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { ExtensionSecurityModule } from '../extension/extension-security.module';
import { SteamVacService } from './steam-vac.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [WalletModule, forwardRef(() => ExtensionSecurityModule)],
  controllers: [UsersController],
  providers: [UsersService, SteamVacService],
  exports: [UsersService, SteamVacService],
})
export class UsersModule {}
