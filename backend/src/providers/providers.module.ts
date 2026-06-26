import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MockAuthProvider } from './auth/mock-auth.provider';
import { SteamAuthProvider } from './auth/steam-auth.provider';
import { SteamProfileService } from './auth/steam-profile.service';
import { getProvidersConfig } from './config';
import { MockInventoryProvider } from './inventory/mock-inventory.provider';
import { SteamInventoryProvider } from './inventory/steam-inventory.provider';
import { MockTradeProvider } from './trade/mock-trade.provider';
import { SteamTradeProvider } from './trade/steam-trade.provider';
import { AUTH_PROVIDER, INVENTORY_PROVIDER, TRADE_PROVIDER } from './tokens';

@Global()
@Module({
  imports: [UsersModule],
  providers: [
    MockAuthProvider,
    SteamAuthProvider,
    SteamProfileService,
    MockInventoryProvider,
    SteamInventoryProvider,
    MockTradeProvider,
    SteamTradeProvider,
    {
      provide: AUTH_PROVIDER,
      useFactory: (mock: MockAuthProvider, steam: SteamAuthProvider) => {
        return getProvidersConfig().auth === 'steam' ? steam : mock;
      },
      inject: [MockAuthProvider, SteamAuthProvider],
    },
    {
      provide: INVENTORY_PROVIDER,
      useFactory: (
        mock: MockInventoryProvider,
        steam: SteamInventoryProvider,
      ) => {
        return getProvidersConfig().inventory === 'steam' ? steam : mock;
      },
      inject: [MockInventoryProvider, SteamInventoryProvider],
    },
    {
      provide: TRADE_PROVIDER,
      useFactory: (mock: MockTradeProvider, steam: SteamTradeProvider) => {
        return getProvidersConfig().trade === 'steam' ? steam : mock;
      },
      inject: [MockTradeProvider, SteamTradeProvider],
    },
  ],
  exports: [
    AUTH_PROVIDER,
    INVENTORY_PROVIDER,
    TRADE_PROVIDER,
    MockAuthProvider,
    SteamProfileService,
  ],
})
export class ProvidersModule {}
