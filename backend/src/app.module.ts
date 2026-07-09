import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { LotsModule } from './lots/lots.module';
import { WalletModule } from './wallet/wallet.module';
import { OrdersModule } from './orders/orders.module';
import { TradesModule } from './trades/trades.module';
import { SettlementModule } from './settlement/settlement.module';
import { AdminModule } from './admin/admin.module';
import { OutboxModule } from './outbox/outbox.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProvidersModule } from './providers/providers.module';
import { PaymentsModule } from './payments/payments.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { RequestIdMiddleware } from './common/observability/request-id.middleware';
import { TestModule } from './test/test.module';
import { ExtensionModule } from './extension/extension.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ObservabilityModule,
    ProvidersModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    InventoryModule,
    LotsModule,
    WalletModule,
    OrdersModule,
    TradesModule,
    SettlementModule,
    AdminModule,
    OutboxModule,
    NotificationsModule,
    PaymentsModule,
    ...(process.env.ENABLE_EXTENSION_CHANNEL === 'true' ? [ExtensionModule] : []),
    ...(process.env.ENABLE_TEST_ROUTES === 'true' ||
    process.env.ENABLE_MOCK_TRADE === 'true'
      ? [TestModule]
      : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
