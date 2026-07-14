import { HttpStatus, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { isValidSteamOfferId } from '../providers/trade/trade-offer.util';
import { TradeStatusPollerService } from '../trades/trade-status-poller.service';
import { floatsMatch } from '../lots/float-match.util';
import { resolveLotTradeExpectations } from '../lots/lot-trade-expectations.util';
import {
  extensionActiveTradesLimit,
  getExtensionSiteOrigin,
  isExtensionTradeAcknowledgmentEnabled,
} from './extension-trade-ack.config';
import type {
  ActiveTradeCounterparty,
  ActiveTradeEscrow,
  ActiveTradeItem,
  ActiveTradeNextAction,
  TradeAcknowledgmentState,
  TradeAcknowledgmentSummary,
  TradeAcknowledgmentType,
  TradeVerificationCheck,
  TradeVerificationResult,
  TradeVerificationStatus,
} from './extension-trade-ack.types';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.WAITING_TRADE,
  OrderStatus.TRADE_CONFIRMED,
  OrderStatus.SETTLEMENT_HOLD,
];

const ACK_TYPES = new Set<TradeAcknowledgmentType>([
  'SELLER_ACK_SENT',
  'BUYER_ACK_PRE_ACCEPT',
  'BUYER_ACK_RECEIVED',
]);

type OrderWithRelations = NonNullable<
  Awaited<ReturnType<ExtensionTradeAckService['loadOrderForUser']>>
>;

@Injectable()
export class ExtensionTradeAckService {
  private readonly logger = new Logger(ExtensionTradeAckService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TradeStatusPollerService))
    private readonly tradeStatusPoller: TradeStatusPollerService,
  ) {}

  ensureEnabled(): void {
    if (!isExtensionTradeAcknowledgmentEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension trade acknowledgment is disabled',
      );
    }
  }

  async listActiveTrades(
    userId: string,
    limit?: number,
  ): Promise<TradeVerificationResult[]> {
    this.ensureEnabled();
    const cappedLimit = Math.min(
      extensionActiveTradesLimit(),
      Math.max(1, limit ?? extensionActiveTradesLimit()),
    );

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ACTIVE_ORDER_STATUSES },
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      take: cappedLimit,
      include: this.orderInclude(),
    });

    const orderIds = orders.map((order) => order.id);
    const ackMap = await this.loadAcknowledgmentMap(orderIds);

    return orders.map((order) =>
      this.buildVerificationResult(
        order,
        userId,
        undefined,
        ackMap.get(order.id),
      ),
    );
  }

  async verifyTrade(
    userId: string,
    orderId: string,
    offerId?: string | null,
    observed?: {
      assetId?: string | null;
      floatValue?: string | null;
    },
  ): Promise<TradeVerificationResult> {
    this.ensureEnabled();
    const order = await this.loadOrderForUser(orderId, userId);
    const ackMap = await this.loadAcknowledgmentMap([order.id]);
    const normalizedOfferId = this.normalizeOfferId(offerId);
    return this.buildVerificationResult(
      order,
      userId,
      normalizedOfferId,
      ackMap.get(order.id),
      observed,
    );
  }

  async assertOfferSentTrustGate(params: {
    sellerId: string;
    orderId: string;
    offerId: string;
    observed?: {
      assetId?: string | null;
      floatValue?: string | null;
    };
  }): Promise<void> {
    const order = await this.loadOrderForUser(params.orderId, params.sellerId);
    if (order.sellerId !== params.sellerId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only seller can confirm offer sent',
        HttpStatus.FORBIDDEN,
      );
    }
    if (order.status !== OrderStatus.WAITING_TRADE) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        'Offer can only be sent while waiting for trade',
        HttpStatus.BAD_REQUEST,
      );
    }

    const asset = order.lot.inventoryAsset;
    const sellerStillHoldsAsset =
      asset.ownerId === params.sellerId &&
      (asset.status === 'AVAILABLE' || asset.status === 'RESERVED');

    if (!sellerStillHoldsAsset) {
      // Offer may have already been accepted; keep offerId and verify delivery.
      this.logger.warn(
        JSON.stringify({
          event: 'offer_sent_asset_already_gone',
          orderId: params.orderId,
          offerId: params.offerId,
          assetStatus: asset.status,
          ownerId: asset.ownerId,
          sellerId: params.sellerId,
        }),
      );
      void this.tradeStatusPoller.pollOrderById(params.orderId).catch((error) => {
        this.logger.warn(
          `Delivery check after gone-asset OFFER_SENT failed for ${params.orderId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    }

    if (isExtensionTradeAcknowledgmentEnabled()) {
      const verification = await this.verifyTrade(
        params.sellerId,
        params.orderId,
        params.offerId,
        params.observed,
      );
      if (verification.verificationStatus === 'mismatch') {
        throw new AppException(
          ErrorCode.EXTENSION_TASK_INVALID_ACK,
          'Trade offer does not match lot snapshot',
          HttpStatus.BAD_REQUEST,
          { reasonCode: 'ITEM_MISMATCH' },
        );
      }
      return;
    }

    if (!sellerStillHoldsAsset) {
      return;
    }

    const expectations = resolveLotTradeExpectations(
      order.lot.listingSnapshot,
      asset,
    );
    const expectedAssetId =
      order.tradeOperation?.expectedAssetId ?? expectations.expectedAssetId;
    const observedAssetId = params.observed?.assetId?.trim() || null;
    if (observedAssetId && observedAssetId !== expectedAssetId) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        'Selected item does not match order asset',
        HttpStatus.BAD_REQUEST,
        { reasonCode: 'ITEM_MISMATCH' },
      );
    }
  }

  async acknowledge(params: {
    userId: string;
    orderId: string;
    type: string;
    offerId?: string | null;
    idempotencyKey: string;
  }): Promise<{
    ok: true;
    type: TradeAcknowledgmentType;
    idempotent: boolean;
  }> {
    this.ensureEnabled();
    const type = params.type as TradeAcknowledgmentType;
    if (!ACK_TYPES.has(type)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid acknowledgment type',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!params.idempotencyKey.trim()) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'payload.idempotencyKey is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.prisma.tradeAcknowledgment.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return {
        ok: true,
        type: existing.type as TradeAcknowledgmentType,
        idempotent: true,
      };
    }

    const order = await this.loadOrderForUser(params.orderId, params.userId);
    const role = order.buyerId === params.userId ? 'buyer' : 'seller';
    this.assertAcknowledgmentAllowed(order, role, type);

    await this.prisma.tradeAcknowledgment.create({
      data: {
        orderId: order.id,
        userId: params.userId,
        role,
        type,
        offerId: this.normalizeOfferId(params.offerId),
        idempotencyKey: params.idempotencyKey,
      },
    });

    if (type === 'BUYER_ACK_RECEIVED') {
      void this.tradeStatusPoller
        .pollOrderById(order.id, { force: true })
        .catch((error) => {
          this.logger.warn(
            `Immediate trade poll failed after buyer ack for order ${order.id}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        });
    }

    return { ok: true, type, idempotent: false };
  }

  async getAcknowledgmentSummary(
    orderId: string,
  ): Promise<TradeAcknowledgmentSummary> {
    const rows = await this.prisma.tradeAcknowledgment.findMany({
      where: { orderId },
      select: { type: true },
    });
    return this.summarizeAcknowledgments(rows);
  }

  private orderInclude() {
    return {
      lot: {
        include: {
          inventoryAsset: { include: { itemDefinition: true } },
          listingSnapshot: true,
        },
      },
      tradeOperation: true,
      hold: true,
      buyer: {
        select: {
          id: true,
          username: true,
          steamId: true,
          steamPersonaName: true,
          steamAvatarUrl: true,
        },
      },
      seller: {
        select: {
          id: true,
          username: true,
          steamId: true,
          steamPersonaName: true,
          steamAvatarUrl: true,
        },
      },
    } as const;
  }

  private async loadOrderForUser(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude(),
    });
    if (!order) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return order;
  }

  private async loadAcknowledgmentMap(orderIds: string[]) {
    if (orderIds.length === 0) {
      return new Map<string, TradeAcknowledgmentState>();
    }
    const rows = await this.prisma.tradeAcknowledgment.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, type: true },
    });
    const map = new Map<string, TradeAcknowledgmentState>();
    for (const orderId of orderIds) {
      map.set(
        orderId,
        this.summarizeAcknowledgments(
          rows.filter((row) => row.orderId === orderId),
        ),
      );
    }
    return map;
  }

  private summarizeAcknowledgments(
    rows: Array<{ type: string }>,
  ): TradeAcknowledgmentState {
    const types = new Set(rows.map((row) => row.type));
    return {
      sellerAckSent: types.has('SELLER_ACK_SENT'),
      buyerPreAccept: types.has('BUYER_ACK_PRE_ACCEPT'),
      buyerReceived: types.has('BUYER_ACK_RECEIVED'),
    };
  }

  private buildVerificationResult(
    order: OrderWithRelations,
    userId: string,
    observedOfferId: string | null | undefined,
    acknowledgments?: TradeAcknowledgmentState,
    observed?: {
      assetId?: string | null;
      floatValue?: string | null;
    },
  ): TradeVerificationResult {
    const role = order.buyerId === userId ? 'buyer' : 'seller';
    const linkedOfferId = order.tradeOperation?.externalOfferId ?? null;
    const checks = this.buildChecks(
      order,
      role,
      linkedOfferId,
      observedOfferId,
      observed,
    );
    const verificationStatus = this.resolveVerificationStatus(checks);
    const ackState =
      acknowledgments ??
      ({
        sellerAckSent: false,
        buyerPreAccept: false,
        buyerReceived: false,
      } satisfies TradeAcknowledgmentState);

    return {
      orderId: order.id,
      orderShortId: order.id.slice(0, 8),
      role,
      orderStatus: order.status,
      offerId: linkedOfferId,
      verificationStatus,
      checks,
      item: this.mapItem(order),
      counterparty: this.mapCounterparty(order, role),
      escrow: this.mapEscrow(order),
      acknowledgments: ackState,
      nextAction: this.resolveNextAction(
        order,
        role,
        verificationStatus,
        ackState,
      ),
      siteUrl: `${getExtensionSiteOrigin()}/orders/${order.id}`,
      amountMinor: order.amountMinor.toString(),
    };
  }

  private buildChecks(
    order: OrderWithRelations,
    role: 'buyer' | 'seller',
    linkedOfferId: string | null,
    observedOfferId?: string | null,
    observed?: {
      assetId?: string | null;
      floatValue?: string | null;
    },
  ): TradeVerificationCheck[] {
    const asset = order.lot.inventoryAsset;
    const expectations = resolveLotTradeExpectations(
      order.lot.listingSnapshot,
      asset,
    );
    const expectedAssetId =
      order.tradeOperation?.expectedAssetId ?? expectations.expectedAssetId;
    const expectedFloatValue = expectations.expectedFloatValue;
    const observedAssetId = observed?.assetId?.trim() || null;
    const observedFloatValue = observed?.floatValue ?? null;
    const checks: TradeVerificationCheck[] = [
      {
        key: 'escrow_active',
        passed: Boolean(order.hold) && order.holdAmountMinor > 0n,
        label: 'Средства защищены на платформе',
        severity: order.hold ? 'ok' : 'error',
      },
      {
        key: 'order_status',
        passed: ACTIVE_ORDER_STATUSES.includes(order.status),
        label: 'Сделка активна на R.I.P Market',
        severity: ACTIVE_ORDER_STATUSES.includes(order.status) ? 'ok' : 'warn',
      },
      {
        key: 'offer_linked',
        passed: Boolean(linkedOfferId),
        label: linkedOfferId
          ? 'Обмен привязан к заказу'
          : 'Ожидаем отправку обмена',
        severity: linkedOfferId ? 'ok' : 'warn',
      },
      {
        key: 'snapshot_recorded',
        passed: true,
        label: order.lot.listingSnapshot
          ? 'Характеристики лота зафиксированы'
          : 'Снимок лота отсутствует (старый лот)',
        severity: order.lot.listingSnapshot ? 'ok' : 'warn',
      },
      {
        key: 'item_match',
        passed: Boolean(expectedAssetId),
        label: expectedAssetId
          ? `Предмет заказа: asset ${expectedAssetId}`
          : 'Предмет заказа не определён',
        severity: expectedAssetId ? 'ok' : 'error',
      },
      {
        key: 'counterparty_match',
        passed:
          role === 'buyer'
            ? Boolean(order.seller.steamId)
            : Boolean(order.buyer.steamId),
        label:
          role === 'buyer'
            ? 'Продавец указан в заказе'
            : 'Покупатель указан в заказе',
        severity:
          role === 'buyer'
            ? order.seller.steamId
              ? 'ok'
              : 'warn'
            : order.buyer.steamId
              ? 'ok'
              : 'warn',
      },
    ];

    if (observedAssetId) {
      const assetMatches = observedAssetId === expectedAssetId;
      checks.push({
        key: 'item_asset_match',
        passed: assetMatches,
        label: assetMatches
          ? 'Asset ID в обмене совпадает с заказом'
          : 'Asset ID в обмене не совпадает с заказом',
        severity: assetMatches ? 'ok' : 'error',
      });
    }

    if (expectedFloatValue) {
      const floatMatches = floatsMatch(expectedFloatValue, observedFloatValue);
      checks.push({
        key: 'item_float_match',
        passed: observedFloatValue ? floatMatches : false,
        label: observedFloatValue
          ? floatMatches
            ? `Float совпадает (${expectedFloatValue})`
            : `Float не совпадает (ожидали ${expectedFloatValue})`
          : `Ожидаемый float: ${expectedFloatValue}`,
        severity: observedFloatValue ? (floatMatches ? 'ok' : 'error') : 'warn',
      });
    }

    if (observedOfferId) {
      const matchesLinked = !linkedOfferId || linkedOfferId === observedOfferId;
      checks.push({
        key: 'offer_id_match',
        passed: matchesLinked && isValidSteamOfferId(observedOfferId),
        label: matchesLinked
          ? 'Этот обмен соответствует заказу'
          : 'Обмен не совпадает с заказом',
        severity: matchesLinked ? 'ok' : 'error',
      });
    }

    return checks;
  }

  private resolveVerificationStatus(
    checks: TradeVerificationCheck[],
  ): TradeVerificationStatus {
    if (checks.some((check) => check.severity === 'error' && !check.passed)) {
      return 'mismatch';
    }
    const offerLinked = checks.find((check) => check.key === 'offer_linked');
    if (offerLinked && !offerLinked.passed) {
      return 'partial';
    }
    if (checks.every((check) => check.passed)) {
      return 'verified';
    }
    return 'pending';
  }

  private mapItem(order: OrderWithRelations): ActiveTradeItem {
    const snapshot = order.lot.listingSnapshot;
    const asset = order.lot.inventoryAsset;
    if (snapshot) {
      return {
        marketHashName: snapshot.marketHashName,
        floatValue: snapshot.floatValue?.toString() ?? null,
        wear: snapshot.wear,
        iconUrl: snapshot.iconUrl,
        assetExternalId: snapshot.assetExternalId,
        stickers: Array.isArray(snapshot.stickers)
          ? (snapshot.stickers as ActiveTradeItem['stickers'])
          : [],
      };
    }
    return {
      marketHashName: asset.itemDefinition.marketHashName,
      floatValue: asset.floatValue?.toString() ?? null,
      wear: asset.wear,
      iconUrl: asset.itemDefinition.iconUrl,
      assetExternalId: asset.assetExternalId,
      stickers: Array.isArray(asset.stickers)
        ? (asset.stickers as ActiveTradeItem['stickers'])
        : [],
    };
  }

  private mapCounterparty(
    order: OrderWithRelations,
    role: 'buyer' | 'seller',
  ): ActiveTradeCounterparty {
    const party = role === 'buyer' ? order.seller : order.buyer;
    return {
      userId: party.id,
      username: party.username,
      steamId: party.steamId,
      personaName: party.steamPersonaName,
      avatarUrl: party.steamAvatarUrl,
    };
  }

  private mapEscrow(order: OrderWithRelations): ActiveTradeEscrow {
    if (!order.hold) {
      return { holdAmountMinor: '0', status: 'none' };
    }
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELED ||
      order.status === OrderStatus.FAILED
    ) {
      return {
        holdAmountMinor: order.hold.amountMinor.toString(),
        status: 'released',
      };
    }
    return {
      holdAmountMinor: order.hold.amountMinor.toString(),
      status: 'active',
    };
  }

  private resolveNextAction(
    order: OrderWithRelations,
    role: 'buyer' | 'seller',
    verificationStatus: TradeVerificationStatus,
    acknowledgments: TradeAcknowledgmentState,
  ): ActiveTradeNextAction {
    if (verificationStatus === 'mismatch') {
      return {
        kind: 'report_issue',
        title: 'Обмен не совпадает с заказом',
        description:
          'Не принимайте этот trade offer. Откройте заказ на R.I.P Market.',
      };
    }

    if (role === 'seller') {
      if (
        order.status === OrderStatus.WAITING_TRADE &&
        !order.tradeOperation?.externalOfferId
      ) {
        return {
          kind: 'wait',
          title: 'Отправьте обмен',
          description:
            'Расширение отправит trade offer автоматически. Подтвердите Steam Guard при необходимости.',
        };
      }
      if (
        order.status === OrderStatus.WAITING_TRADE &&
        !acknowledgments.sellerAckSent
      ) {
        return {
          kind: 'confirm_sent',
          title: 'Подтвердите отправку',
          description:
            'Если Guard уже подтверждён — нажмите «Я отправил обмен». Покупатель увидит, что предложение ушло.',
        };
      }
      if (order.status === OrderStatus.WAITING_TRADE) {
        return {
          kind: 'confirm_guard',
          title: 'Ожидаем принятия покупателем',
          description:
            'Обмен отправлен. Покупатель должен принять его в Steam.',
        };
      }
      if (
        order.status === OrderStatus.TRADE_CONFIRMED ||
        order.status === OrderStatus.SETTLEMENT_HOLD
      ) {
        return {
          kind: 'platform_verifying',
          title: 'Сделка подтверждена платформой',
          description: 'Выплата будет доступна после проверки.',
        };
      }
      return {
        kind: 'completed',
        title: 'Сделка завершена',
        description: 'Статус обновится на сайте автоматически.',
      };
    }

    if (order.status === OrderStatus.WAITING_TRADE) {
      if (!order.tradeOperation?.externalOfferId) {
        return {
          kind: 'wait',
          title: 'Ждём обмен от продавца',
          description:
            'Обычно это занимает 1–2 минуты. Страница обновится автоматически.',
        };
      }
      if (!acknowledgments.buyerPreAccept) {
        return {
          kind: 'accept_in_steam',
          title: 'Примите обмен в Steam',
          description:
            'Сделка проверена платформой. Откройте Steam и примите trade offer.',
        };
      }
      if (!acknowledgments.buyerReceived) {
        return {
          kind: 'confirm_received',
          title: 'Подтвердите получение',
          description:
            'После принятия обмена в Steam нажмите «Подтвердил получение предмета».',
        };
      }
      return {
        kind: 'accept_in_steam',
        title: 'Подтвердите в Steam',
        description:
          'Вы подтвердили сделку в R.I.P Market. Примите обмен в Steam.',
      };
    }

    if (
      order.status === OrderStatus.TRADE_CONFIRMED ||
      order.status === OrderStatus.SETTLEMENT_HOLD
    ) {
      if (!acknowledgments.buyerReceived) {
        return {
          kind: 'confirm_received',
          title: 'Подтвердите получение',
          description:
            'Предмет должен быть в инвентаре. Подтвердите получение для завершения сделки на платформе.',
        };
      }
      return {
        kind: 'platform_verifying',
        title: 'Обмен подтверждён',
        description:
          'Платформа проверяет передачу предмета. Статус обновится автоматически.',
      };
    }

    return {
      kind: 'completed',
      title: 'Сделка завершена',
      description: 'Предмет должен быть в вашем инвентаре Steam.',
    };
  }

  private assertAcknowledgmentAllowed(
    order: OrderWithRelations,
    role: 'buyer' | 'seller',
    type: TradeAcknowledgmentType,
  ): void {
    if (type === 'SELLER_ACK_SENT') {
      if (role !== 'seller') {
        throw new AppException(
          ErrorCode.FORBIDDEN,
          'Only seller can acknowledge sent offer',
          HttpStatus.FORBIDDEN,
        );
      }
      if (order.status !== OrderStatus.WAITING_TRADE) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'Seller acknowledgment is only allowed while waiting for trade',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }

    if (role !== 'buyer') {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only buyer can acknowledge receipt',
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      type === 'BUYER_ACK_PRE_ACCEPT' &&
      order.status !== OrderStatus.WAITING_TRADE
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Buyer pre-accept is only allowed while waiting for trade',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      type === 'BUYER_ACK_RECEIVED' &&
      order.status !== OrderStatus.WAITING_TRADE &&
      order.status !== OrderStatus.TRADE_CONFIRMED &&
      order.status !== OrderStatus.SETTLEMENT_HOLD
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Buyer received acknowledgment is not allowed for this order status',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private normalizeOfferId(offerId?: string | null): string | null {
    if (!offerId) {
      return null;
    }
    const trimmed = offerId.trim();
    if (!trimmed || !isValidSteamOfferId(trimmed)) {
      return null;
    }
    return trimmed;
  }
}
