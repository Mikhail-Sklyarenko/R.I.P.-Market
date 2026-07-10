import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SteamVacService } from './steam-vac.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [WalletModule],
  controllers: [UsersController],
  providers: [UsersService, SteamVacService],
  exports: [UsersService, SteamVacService],
})
export class UsersModule {}
