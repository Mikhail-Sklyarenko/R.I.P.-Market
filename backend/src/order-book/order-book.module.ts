import { Module } from '@nestjs/common';
import { OrderBookService } from './order-book.service';

@Module({
  providers: [OrderBookService],
  exports: [OrderBookService],
})
export class OrderBookModule {}
