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
import { AdminReasonDto } from './dto/admin-reason.dto';
import { ListAdminLotsQueryDto } from './dto/list-admin-lots-query.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { RestrictUserBodyDto } from './dto/restrict-user-body.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ReverseSettlementHoldDto } from './dto/reverse-settlement-hold.dto';
import { UpsertAllowlistEntryDto } from './dto/upsert-allowlist.dto';

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

  @Get('disputes/reason-codes')
  listDisputeReasonCodes() {
    return this.adminService.listDisputeReasonCodes();
  }

  @Get('metrics/extension-flow')
  async getExtensionFlowMetrics() {
    return this.adminService.getExtensionFlowMetrics();
  }

  @Get('rollout/extension')
  async getExtensionRolloutStatus() {
    return this.adminService.getExtensionRolloutStatus();
  }

  @Get('rollout/extension/allowlist')
  async listExtensionRolloutAllowlist() {
    return this.adminService.listExtensionRolloutAllowlist();
  }

  @Post('rollout/extension/allowlist/:steamId')
  async upsertExtensionRolloutAllowlist(
    @CurrentUser() actor: AuthUser,
    @Param('steamId') steamId: string,
    @Body() body: UpsertAllowlistEntryDto,
  ) {
    return this.adminService.upsertExtensionRolloutAllowlist(
      steamId,
      body,
      actor.sub,
    );
  }

  @Post('rollout/extension/allowlist/:steamId/delete')
  async deleteExtensionRolloutAllowlist(
    @CurrentUser() actor: AuthUser,
    @Param('steamId') steamId: string,
  ) {
    return this.adminService.deleteExtensionRolloutAllowlist(
      steamId,
      actor.sub,
    );
  }

  @Get('orders/:id/timeline')
  async getOrderTimeline(@Param('id') orderId: string) {
    return this.adminService.getOrderTimeline(orderId);
  }

  @Get('users')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Get('users/:id')
  async getUser(@Param('id') userId: string) {
    return this.adminService.getUser(userId);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('users/:id/restrict')
  async restrictUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') userId: string,
    @Body() body: RestrictUserBodyDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.restrictUser(
      userId,
      body.status,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('users/:id/unrestrict')
  async unrestrictUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') userId: string,
    @Body() body: AdminReasonDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.unrestrictUser(
      userId,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
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
  async listOrders(@Query() query: ListAdminOrdersQueryDto) {
    return this.adminService.listOrders(query);
  }

  @Get('lots')
  async listLots(@Query() query: ListAdminLotsQueryDto) {
    return this.adminService.listLots(query);
  }

  @Get('lots/:id')
  async getLot(@Param('id') lotId: string) {
    return this.adminService.getLot(lotId);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('lots/:id/block')
  async blockLot(
    @CurrentUser() actor: AuthUser,
    @Param('id') lotId: string,
    @Body() body: AdminReasonDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.blockLot(
      lotId,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('lots/:id/unblock')
  async unblockLot(
    @CurrentUser() actor: AuthUser,
    @Param('id') lotId: string,
    @Body() body: AdminReasonDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.unblockLot(
      lotId,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('lots/:id/cancel')
  async cancelLot(
    @CurrentUser() actor: AuthUser,
    @Param('id') lotId: string,
    @Body() body: AdminReasonDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.adminCancelLot(
      lotId,
      actor.sub,
      body.reason,
      idempotencyKey,
    );
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

  @Post('orders/:id/check-delivery')
  async checkDelivery(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
  ) {
    return this.adminService.checkDelivery(orderId, actor.sub);
  }

  @Get('metrics/shadow')
  async getShadowMetrics() {
    return this.adminService.getShadowDashboard();
  }

  @Get('settlement/allowlist')
  async listSettlementAllowlist() {
    return this.adminService.listSettlementAllowlist();
  }

  @Post('settlement/allowlist/:steamId')
  async upsertSettlementAllowlist(
    @CurrentUser() actor: AuthUser,
    @Param('steamId') steamId: string,
    @Body() body: UpsertAllowlistEntryDto,
  ) {
    return this.adminService.upsertSettlementAllowlist(
      steamId,
      body,
      actor.sub,
    );
  }

  @Post('settlement/allowlist/:steamId/delete')
  async deleteSettlementAllowlist(
    @CurrentUser() actor: AuthUser,
    @Param('steamId') steamId: string,
  ) {
    return this.adminService.deleteSettlementAllowlist(steamId, actor.sub);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('orders/:id/retry-settlement')
  async retrySettlement(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.retrySettlement(
      orderId,
      actor.sub,
      idempotencyKey,
    );
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
      body,
      idempotencyKey,
    );
  }

  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('orders/:id/reverse-settlement-hold')
  async reverseSettlementHold(
    @CurrentUser() actor: AuthUser,
    @Param('id') orderId: string,
    @Body() body: ReverseSettlementHoldDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.adminService.reverseSettlementHold(
      orderId,
      actor.sub,
      body.reasonCode ?? 'SETTLEMENT_HOLD_REVERSED',
      body.reasonNote,
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
      body,
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
