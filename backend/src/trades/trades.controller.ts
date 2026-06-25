import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { MockFailDto } from './dto/mock-fail.dto';
import { TradesService } from './trades.service';

@ApiTags('trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post(':orderId/mock-success')
  async mockSuccess(
    @CurrentUser() actor: AuthUser,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.tradesService.mockSuccess(orderId, actor.sub, idempotencyKey);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post(':orderId/mock-fail')
  async mockFail(
    @CurrentUser() actor: AuthUser,
    @Param('orderId') orderId: string,
    @Body() body: MockFailDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.tradesService.mockFail(
      orderId,
      actor.sub,
      idempotencyKey,
      body.mode,
      body.reasonCode,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post(':orderId/mock-timeout')
  async mockTimeout(
    @CurrentUser() actor: AuthUser,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.tradesService.mockTimeout(orderId, actor.sub, idempotencyKey);
  }

  @Get(':id')
  async getTrade(@Param('id') tradeId: string) {
    return this.tradesService.getTradeById(tradeId);
  }
}
