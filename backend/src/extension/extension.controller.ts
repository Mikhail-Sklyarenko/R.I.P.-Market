import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../common/auth-user.interface';
import { CurrentUser } from '../common/current-user.decorator';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  readJsonString,
  readOptionalJsonString,
} from '../common/json-string.util';
import { ExtensionHandshakeDto } from './dto/handshake.dto';
import { SignedEnvelopeDto } from './dto/signed-envelope.dto';
import { isExtensionChannelEnabled } from './extension-channel.config';
import { CurrentExtensionAuth } from './current-extension-auth.decorator';
import { ExtensionSessionGuard } from './guards/extension-session.guard';
import { ExtensionSignatureGuard } from './guards/extension-signature.guard';
import { ExtensionSecurityService } from './extension-security.service';
import { ExtensionTradeTaskService } from './extension-trade-task.service';
import { isExtensionTaskPipelineEnabled } from './extension-task.config';
import { isExtensionOfferOrchestratorEnabled } from './extension-offer-orchestrator.config';
import { isExtensionTradeReferenceEnabled } from '../trades/trade-reference.config';
import { TradeReferenceReconcileService } from '../trades/trade-reference-reconcile.service';
import { AntiFraudRuleService } from '../common/observability/anti-fraud.service';
import { ExtensionRateLimitService } from '../common/observability/extension-rate-limit.service';
import { ExtensionTradeAckService } from './extension-trade-ack.service';
import { isExtensionTradeAcknowledgmentEnabled } from './extension-trade-ack.config';
import { InventoryService } from '../inventory/inventory.service';
import { ExtensionSuggestedPricesDto } from './dto/extension-suggested-prices.dto';
import { ExtensionBrowserAssistInventoryDto } from './dto/extension-browser-assist-inventory.dto';

@ApiTags('extension')
@Controller('extension')
export class ExtensionController {
  constructor(
    private readonly extensionSecurity: ExtensionSecurityService,
    private readonly extensionTaskService: ExtensionTradeTaskService,
    private readonly tradeReferenceReconcileService: TradeReferenceReconcileService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: ExtensionRateLimitService,
    private readonly antiFraud: AntiFraudRuleService,
    private readonly extensionTradeAckService: ExtensionTradeAckService,
    private readonly inventoryService: InventoryService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('handshake')
  async handshake(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExtensionHandshakeDto,
  ) {
    this.ensureEnabled();
    this.rateLimit.assertHandshakeAllowed(user.sub);
    this.antiFraud.recordHandshake(user.sub);
    return this.extensionSecurity.handshake(
      user.sub,
      dto.deviceId,
      dto.publicKey,
    );
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @CurrentExtensionAuth() auth: { sessionId: string; userId: string },
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    await this.extensionSecurity.touchHeartbeat(auth.sessionId);
    const hint = await this.extensionTaskService.getPendingWorkHint(
      auth.userId,
    );
    const suggestedPollMode =
      hint.hasPendingTask || hint.hasActiveDeal ? 'active' : 'idle';
    return {
      ok: true,
      hasPendingTask: hint.hasPendingTask,
      hasActiveDeal: hint.hasActiveDeal,
      suggestedPollMode,
    };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('commands/ack')
  @HttpCode(HttpStatus.OK)
  async commandAck(
    @CurrentExtensionAuth() auth: { sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    const payload = dto.payload;
    const commandId = readJsonString(payload.commandId);
    if (!commandId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.commandId is required',
      );
    }

    // Idempotent ack persistence: duplicate commandId is accepted as no-op.
    await this.prisma.extensionCommandAck.upsert({
      where: {
        sessionId_commandId: { sessionId: auth.sessionId, commandId },
      },
      create: {
        sessionId: auth.sessionId,
        commandId,
        payload: payload as Prisma.InputJsonValue,
      },
      update: {},
    });
    return { ok: true, commandId };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('tasks/poll')
  @HttpCode(HttpStatus.OK)
  async pollTasks(
    @CurrentExtensionAuth() auth: { sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTaskPipelineEnabled();
    const limit = Number(dto.payload.limit ?? 20);
    const tasks = await this.extensionTaskService.pollTasks(
      auth.sessionId,
      limit,
    );
    return { tasks };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('tasks/ack')
  @HttpCode(HttpStatus.OK)
  async ackTask(
    @CurrentExtensionAuth() auth: { sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTaskPipelineEnabled();
    const taskId = readJsonString(dto.payload.taskId);
    const result = readJsonString(dto.payload.result, 'ACK').toUpperCase();
    if (!taskId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.taskId is required',
      );
    }
    if (result === 'ACK') {
      await this.extensionTaskService.ackTask(taskId, dto.payload as object);
    } else {
      const reasonCode = readJsonString(dto.payload.reasonCode, 'NACK');
      await this.extensionTaskService.nackTask(taskId, reasonCode);
    }
    return { ok: true, taskId, result };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('tasks/progress')
  @HttpCode(HttpStatus.OK)
  async reportTaskProgress(
    @CurrentExtensionAuth() auth: { sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTaskPipelineEnabled();
    this.ensureOfferOrchestratorEnabled();
    const payload = dto.payload;
    const taskId = readJsonString(payload.taskId);
    const phase = readJsonString(payload.phase) as never;
    const idempotencyKey = readJsonString(payload.idempotencyKey);
    if (!taskId || !phase || !idempotencyKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.taskId, payload.phase and payload.idempotencyKey are required',
      );
    }
    return this.extensionTaskService.reportTaskProgress({
      taskId,
      phase,
      idempotencyKey,
      reasonCode: readOptionalJsonString(payload.reasonCode),
      offerId: readOptionalJsonString(payload.offerId),
      details: payload.details as Prisma.JsonObject | undefined,
    });
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('orders/:orderId/trade-reference')
  @HttpCode(HttpStatus.OK)
  async submitTradeReference(
    @CurrentExtensionAuth() auth: { userId: string; sessionId: string },
    @Param('orderId') orderId: string,
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.rateLimit.assertTradeReferenceAllowed(auth.userId);
    this.ensureExtensionTradeReferenceEnabled();
    const payload = dto.payload;
    const payloadOrderId = readJsonString(payload.orderId, orderId);
    if (payloadOrderId !== orderId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.orderId must match path orderId',
      );
    }
    const idempotencyKey = readJsonString(payload.idempotencyKey);
    if (!idempotencyKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.idempotencyKey is required',
      );
    }
    return this.tradeReferenceReconcileService.reconcile({
      orderId,
      sellerId: auth.userId,
      offerId: readOptionalJsonString(payload.offerId),
      tradeUrl: readOptionalJsonString(payload.tradeUrl),
      idempotencyKey,
      source: 'EXTENSION',
      actorUserId: auth.userId,
    });
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('trades/active')
  @HttpCode(HttpStatus.OK)
  async listActiveTrades(
    @CurrentExtensionAuth() auth: { userId: string; sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTradeAcknowledgmentEnabled();
    const limit = Number(dto.payload.limit ?? 10);
    const trades = await this.extensionTradeAckService.listActiveTrades(
      auth.userId,
      limit,
    );
    return { trades };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('trades/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTrade(
    @CurrentExtensionAuth() auth: { userId: string; sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTradeAcknowledgmentEnabled();
    const orderId = readJsonString(dto.payload.orderId);
    if (!orderId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.orderId is required',
      );
    }
    const offerId = readOptionalJsonString(dto.payload.offerId);
    const observedAssetId = readOptionalJsonString(dto.payload.observedAssetId);
    const observedFloatValue = readOptionalJsonString(
      dto.payload.observedFloatValue,
    );
    return this.extensionTradeAckService.verifyTrade(
      auth.userId,
      orderId,
      offerId,
      {
        assetId: observedAssetId,
        floatValue: observedFloatValue,
      },
    );
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('trades/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeTrade(
    @CurrentExtensionAuth() auth: { userId: string; sessionId: string },
    @Body() dto: SignedEnvelopeDto,
  ) {
    this.assertSignedRateLimit(auth.sessionId);
    this.ensureTradeAcknowledgmentEnabled();
    const payload = dto.payload;
    const orderId = readJsonString(payload.orderId);
    const type = readJsonString(payload.type);
    const idempotencyKey = readJsonString(payload.idempotencyKey);
    if (!orderId || !type || !idempotencyKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.orderId, payload.type and payload.idempotencyKey are required',
      );
    }
    return this.extensionTradeAckService.acknowledge({
      userId: auth.userId,
      orderId,
      type,
      offerId: readOptionalJsonString(payload.offerId),
      idempotencyKey,
    });
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard)
  @Post('inventory/suggested-prices')
  @HttpCode(HttpStatus.OK)
  async suggestedPrices(
    @CurrentExtensionAuth() auth: { sessionId: string; userId: string },
    @Body() dto: ExtensionSuggestedPricesDto,
  ) {
    this.ensureEnabled();
    this.rateLimit.assertSignedRequestAllowed(auth.sessionId);
    const items = dto.items.filter(
      (item) =>
        Boolean(item.marketHashName?.trim()) ||
        Boolean(item.steamAssetId?.trim()),
    );
    if (items.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'items require marketHashName or steamAssetId',
      );
    }
    return this.inventoryService.getExtensionSuggestedPrices(
      auth.userId,
      items,
      {
        forceRefresh: dto.forceRefresh === true,
        cacheOnly: dto.cacheOnly === true,
      },
    );
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard)
  @Post('inventory/browser-assist')
  @HttpCode(HttpStatus.OK)
  async browserAssistInventory(
    @CurrentExtensionAuth() auth: { sessionId: string; userId: string },
    @Body() dto: ExtensionBrowserAssistInventoryDto,
  ) {
    this.ensureEnabled();
    this.rateLimit.assertSignedRequestAllowed(auth.sessionId);
    const result = await this.inventoryService.applyExtensionBrowserAssist(
      auth.userId,
      {
        steamId: dto.steamId,
        assets: dto.assets,
        complete: dto.complete === true,
      },
    );
    return {
      ok: true,
      itemCount: result.itemCount,
      status: result.status,
      warning: result.warning ?? null,
      stale: result.stale,
    };
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('session/rotate')
  async rotate(@CurrentExtensionAuth() auth: { sessionId: string }) {
    this.assertSignedRateLimit(auth.sessionId);
    return this.extensionSecurity.rotateSession(auth.sessionId);
  }

  @ApiBearerAuth()
  @ApiHeader({ name: 'Authorization', required: true })
  @UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
  @Post('session/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@CurrentExtensionAuth() auth: { sessionId: string }) {
    this.assertSignedRateLimit(auth.sessionId);
    await this.extensionSecurity.revokeSession(auth.sessionId);
    return { ok: true };
  }

  private assertSignedRateLimit(sessionId: string): void {
    this.rateLimit.assertSignedRequestAllowed(sessionId);
  }

  private ensureEnabled(): void {
    if (!isExtensionChannelEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension channel is disabled',
      );
    }
  }

  private ensureOfferOrchestratorEnabled(): void {
    if (!isExtensionOfferOrchestratorEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension offer orchestrator is disabled',
      );
    }
  }

  private ensureTaskPipelineEnabled(): void {
    if (!isExtensionTaskPipelineEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension task pipeline is disabled',
      );
    }
  }

  private ensureExtensionTradeReferenceEnabled(): void {
    this.ensureEnabled();
    if (!isExtensionTradeReferenceEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension trade reference endpoint is disabled',
      );
    }
  }

  private ensureTradeAcknowledgmentEnabled(): void {
    this.ensureEnabled();
    if (!isExtensionTradeAcknowledgmentEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension trade acknowledgment is disabled',
      );
    }
  }
}
