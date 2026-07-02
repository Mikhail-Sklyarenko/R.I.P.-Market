import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentsService } from './payments.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentReconciliationService: PaymentReconciliationService,
  ) {}

  @ApiQuery({ name: 'status', required: false })
  @Get('withdrawals')
  async listWithdrawals(@Query('status') status?: string) {
    if (!status || status === 'PENDING_REVIEW') {
      return this.paymentsService.listPendingWithdrawals();
    }
    throw new BadRequestException('Unsupported withdrawal status filter');
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post('withdrawals/:id/approve')
  async approveWithdrawal(
    @CurrentUser() actor: AuthUser,
    @Param('id') withdrawalId: string,
  ) {
    return this.paymentsService.approveWithdrawal(withdrawalId, actor.sub);
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(
    @CurrentUser() actor: AuthUser,
    @Param('id') withdrawalId: string,
    @Body() body: RejectWithdrawalDto,
  ) {
    if (!body.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    return this.paymentsService.rejectWithdrawal(
      withdrawalId,
      actor.sub,
      body.reason,
    );
  }

  @Get('payments/reconciliation')
  async reconcilePayments() {
    return this.paymentReconciliationService.reconcile();
  }
}
