import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { ManualAdjustmentDto } from './dto/manual-adjustment.dto';
import { MockDepositDto } from './dto/mock-deposit.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.sub);
  }

  @Get('transactions')
  async getTransactions(@CurrentUser() user: AuthUser) {
    return this.walletService.getTransactions(user.sub);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('mock-deposit')
  async mockDeposit(
    @CurrentUser() user: AuthUser,
    @Body() body: MockDepositDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (process.env.ENABLE_MOCK_DEPOSIT === 'false') {
      throw new ForbiddenException('Mock deposit is disabled');
    }

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.walletService.mockDeposit(
      user.sub,
      body.amountMinor,
      idempotencyKey,
    );
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/wallets')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post(':userId/manual-adjustment')
  async manualAdjustment(
    @CurrentUser() actor: AuthUser,
    @Param('userId') userId: string,
    @Body() body: ManualAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.walletService.manualAdjustment({
      targetUserId: userId,
      amountMinor: body.amountMinor,
      reason: body.reason,
      actorUserId: actor.sub,
      idempotencyKey,
    });
  }
}
