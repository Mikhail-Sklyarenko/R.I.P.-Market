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
import { CreateDepositCheckoutDto } from './dto/create-deposit-checkout.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { PaymentsService } from './payments.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('deposit')
  async getDeposit(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getDepositInfo(user.sub);
  }

  @Post('deposit/checkout')
  async createDepositCheckout(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateDepositCheckoutDto,
  ) {
    return this.paymentsService.createDepositCheckout({
      userId: user.sub,
      amountMinor: body.amountMinor,
      paymentMethod: body.paymentMethod,
      returnUrl: body.returnUrl,
    });
  }

  @Get('deposit/status')
  async getDepositStatus(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getDepositStatus(user.sub);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('withdrawals')
  async createWithdrawal(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWithdrawalDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.paymentsService.createWithdrawal({
      userId: user.sub,
      toAddress: body.toAddress,
      amountMinor: body.amountMinor,
      paymentMethod: body.paymentMethod,
      idempotencyKey,
    });
  }

  @Get('withdrawals')
  async listWithdrawals(@CurrentUser() user: AuthUser) {
    return this.paymentsService.listWithdrawals(user.sub);
  }

  @Get('withdrawals/:id')
  async getWithdrawal(
    @CurrentUser() user: AuthUser,
    @Param('id') withdrawalId: string,
  ) {
    return this.paymentsService.getWithdrawal(user.sub, withdrawalId);
  }
}
