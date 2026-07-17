import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MockAuthProvider } from './auth/mock-auth.provider';
import { SteamAuthProvider } from './auth/steam-auth.provider';
import { SteamProfileService } from './auth/steam-profile.service';
import { getProvidersConfig } from './config';
import { MockInventoryProvider } from './inventory/mock-inventory.provider';
import { InventoryMetricsService } from './inventory/inventory-metrics.service';
import { InventorySyncCacheService } from './inventory/inventory-sync-cache.service';
import { SteamInventoryProvider } from './inventory/steam-inventory.provider';
import { HybridTradeProvider } from './trade/hybrid-trade.provider';
import { MockTradeProvider } from './trade/mock-trade.provider';
import { SteamTradeProvider } from './trade/steam-trade.provider';
import { MockPaymentProvider } from './payment/mock-payment.provider';
import { CryptoTronGatewayProvider } from './payment/crypto-tron-gateway.provider';
import { E2eCryptoPaymentProvider } from './payment/e2e-crypto-payment.provider';
import {
  AUTH_PROVIDER,
  INVENTORY_PROVIDER,
  PAYMENT_PROVIDER,
  TRADE_PROVIDER,
} from './tokens';

@Global()
@Module({
  imports: [UsersModule],
  providers: [
    MockAuthProvider,
    SteamAuthProvider,
    SteamProfileService,
    MockInventoryProvider,
    SteamInventoryProvider,
    InventorySyncCacheService,
    InventoryMetricsService,
    MockTradeProvider,
    SteamTradeProvider,
    HybridTradeProvider,
    MockPaymentProvider,
    CryptoTronGatewayProvider,
    E2eCryptoPaymentProvider,
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
      useFactory: (
        mock: MockTradeProvider,
        steam: SteamTradeProvider,
        hybrid: HybridTradeProvider,
      ) => {
        // mock → hybrid: admin completeTrade stays mock, offer verify uses Steam
        return getProvidersConfig().trade === 'steam' ? steam : hybrid;
      },
      inject: [MockTradeProvider, SteamTradeProvider, HybridTradeProvider],
    },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        mock: MockPaymentProvider,
        crypto: CryptoTronGatewayProvider,
        e2eCrypto: E2eCryptoPaymentProvider,
      ) => {
        const payment = getProvidersConfig().payment;
        if (payment !== 'crypto_tron') {
          return mock;
        }
        if (process.env.ENABLE_TEST_ROUTES === 'true') {
          return e2eCrypto;
        }
        return crypto;
      },
      inject: [
        MockPaymentProvider,
        CryptoTronGatewayProvider,
        E2eCryptoPaymentProvider,
      ],
    },
  ],
  exports: [
    AUTH_PROVIDER,
    INVENTORY_PROVIDER,
    TRADE_PROVIDER,
    PAYMENT_PROVIDER,
    MockAuthProvider,
    SteamProfileService,
    InventoryMetricsService,
  ],
})
export class ProvidersModule {}
