import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BuyRequestMatchingService } from './buy-request-matching.service';
import { BuyRequestsController } from './buy-requests.controller';
import { BuyRequestsExpiryService } from './buy-requests-expiry.service';
import { BuyRequestsService } from './buy-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BuyRequestsController],
  providers: [
    BuyRequestsService,
    BuyRequestMatchingService,
    BuyRequestsExpiryService,
  ],
  exports: [BuyRequestsService, BuyRequestMatchingService],
})
export class BuyRequestsModule {}
