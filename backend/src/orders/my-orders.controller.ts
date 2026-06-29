import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { ListMyOrdersQueryDto } from './dto/list-my-orders-query.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    return this.ordersService.listMyOrders(user.sub, query);
  }
}
