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
import { AdminModule } from './admin/admin.module';
import { OutboxModule } from './outbox/outbox.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProvidersModule } from './providers/providers.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { RequestIdMiddleware } from './common/observability/request-id.middleware';

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
    AdminModule,
    OutboxModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
