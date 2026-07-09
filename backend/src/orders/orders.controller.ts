import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateTradeReferenceDto } from './dto/update-trade-reference.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.ordersService.create(user.sub, body, idempotencyKey);
  }

  @Get(':id')
  async getById(@CurrentUser() user: AuthUser, @Param('id') orderId: string) {
    return this.ordersService.getById(orderId, user.sub);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Patch(':id/trade-reference')
  async updateTradeReference(
    @CurrentUser() user: AuthUser,
    @Param('id') orderId: string,
    @Body() body: UpdateTradeReferenceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.updateTradeReference(
      user.sub,
      orderId,
      body,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.ordersService.cancel(user.sub, orderId, idempotencyKey);
  }
}
