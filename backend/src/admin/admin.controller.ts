import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
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
import { AdminService } from './admin.service';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly outboxProcessorService: OutboxProcessorService,
  ) {}

  @Get('users')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(userId, body.status, actor.sub);
  }

  @Get('orders')
  async listOrders() {
    return this.adminService.listOrders();
  }

  @Get('orders/:id/status-events')
  async listOrderStatusEvents(@Param('id') orderId: string) {
    return this.adminService.listOrderStatusEvents(orderId);
  }

  @Get('lots/:id/status-events')
  async listLotStatusEvents(@Param('id') lotId: string) {
    return this.adminService.listLotStatusEvents(lotId);
  }

  @Get('orders/:id')
  async getOrderCard(@Param('id') orderId: string) {
    return this.adminService.getOrderCard(orderId);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('orders/:id/apply-observed-status')
  async applyObservedStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.applyObservedStatus(
      orderId,
      actor.sub,
      idempotencyKey,
    );
  }

  @Get('metrics/shadow')
  async getShadowMetrics() {
    return this.adminService.getShadowDashboard();
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('orders/:id/dispute')
  async openDispute(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
    @Body() body: OpenDisputeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.openDispute(
      orderId,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('orders/:id/resolve')
  async resolveDispute(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
    @Body() body: ResolveDisputeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.resolveDispute(
      orderId,
      actor.sub,
      body.resolution,
      body.reason,
      idempotencyKey,
    );
  }

  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @Get('audit-logs')
  async listAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.adminService.listAuditLogs(entityType, entityId);
  }

  @ApiQuery({ name: 'status', required: false })
  @Get('outbox')
  async listOutboxEvents(@Query('status') status?: string) {
    return this.adminService.listOutboxEvents(status);
  }

  @Post('outbox/process')
  async processOutbox() {
    return this.outboxProcessorService.processPending();
  }

  @Post('outbox/:id/retry')
  async retryOutboxEvent(
    @CurrentUser() actor: AuthUser,
    @Param('id') eventId: string,
  ) {
    return this.adminService.retryOutboxEvent(eventId, actor.sub);
  }
}
