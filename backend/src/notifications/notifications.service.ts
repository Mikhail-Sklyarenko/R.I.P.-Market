import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationCategory } from './notification-category.util';
import { notificationCategoryPrefixes } from './notification-category.util';

type OrderContext = {
  id: string;
  buyerId: string;
  sellerId: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    userId: string,
    unreadOnly = false,
    category?: NotificationCategory,
  ) {
    const categoryPrefixes = category
      ? notificationCategoryPrefixes(category)
      : null;

    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
        ...(categoryPrefixes
          ? {
              OR: categoryPrefixes.map((prefix) => ({
                eventType: { startsWith: prefix },
              })),
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return toJsonSafe(notifications);
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return toJsonSafe(updated);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { success: true };
  }

  async createFromOutboxEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    if (aggregateType === 'reconciliation') {
      await this.notifyAdminsReconciliationFailed(eventType, payload);
      return;
    }

    if (aggregateType === 'wallet' && eventType === 'DEPOSIT_COMPLETED') {
      await this.notifyWalletDepositConfirmed(payload);
      return;
    }

    if (aggregateType === 'wallet' && eventType === 'DEPOSIT_CONFIRMED') {
      await this.notifyWalletDepositConfirmed(payload);
      return;
    }

    if (aggregateType === 'wallet' && eventType === 'WITHDRAWAL_REQUESTED') {
      return;
    }

    if (eventType === 'TRADE_SHADOW_MISMATCH') {
      await this.notifyAdminsShadowMismatch(aggregateId, payload);
      return;
    }

    if (aggregateType !== 'order') {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: aggregateId },
      select: { id: true, buyerId: true, sellerId: true },
    });

    if (!order) {
      throw new Error(`Order ${aggregateId} not found for outbox event`);
    }

    const notifications = this.buildNotifications(eventType, order, payload);
    if (notifications.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: notifications,
    });
  }

  private async notifyAdminsShadowMismatch(
    orderId: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    if (admins.length === 0) {
      return;
    }

    const observed =
      typeof payload === 'object' &&
      payload !== null &&
      'observedStatus' in payload &&
      typeof payload.observedStatus === 'string'
        ? payload.observedStatus
        : 'unknown';
    const expected =
      typeof payload === 'object' &&
      payload !== null &&
      'expectedStatus' in payload &&
      typeof payload.expectedStatus === 'string'
        ? payload.expectedStatus
        : 'unknown';

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        eventType: 'TRADE_SHADOW_MISMATCH',
        title: 'Trade shadow mismatch',
        message: `Order ${orderId.slice(0, 8)}…: observed ${observed}, expected ${expected}.`,
        payload: payload ?? { orderId },
      })),
    });
  }

  private async notifyAdminsReconciliationFailed(
    eventType: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    if (admins.length === 0) {
      return;
    }

    const issueCount =
      typeof payload === 'object' &&
      payload !== null &&
      'issueCount' in payload &&
      typeof payload.issueCount === 'number'
        ? payload.issueCount
        : 0;

    const title =
      eventType === 'PAYMENT_RECONCILIATION_FAILED'
        ? 'Payment reconciliation failed'
        : 'Ledger reconciliation failed';
    const scope =
      eventType === 'PAYMENT_RECONCILIATION_FAILED' ? 'payment' : 'ledger';

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        eventType,
        title,
        message: `Found ${issueCount} issue(s) during ${scope} reconciliation.`,
        payload: payload ?? {},
      })),
    });
  }

  private async notifyWalletDepositConfirmed(
    payload: Prisma.JsonValue,
  ): Promise<void> {
    const userId =
      typeof payload === 'object' &&
      payload !== null &&
      'userId' in payload &&
      typeof payload.userId === 'string'
        ? payload.userId
        : null;
    if (!userId) {
      return;
    }

    const amountMinor =
      typeof payload === 'object' &&
      payload !== null &&
      'amountMinor' in payload &&
      typeof payload.amountMinor === 'string'
        ? payload.amountMinor
        : '0';

    await this.prisma.notification.create({
      data: {
        userId,
        eventType: 'DEPOSIT_CONFIRMED',
        title: 'Пополнение зачислено',
        message: `На баланс зачислено $${(Number(amountMinor) / 100).toFixed(2)} (USDT TRC-20).`,
        payload: payload ?? {},
      },
    });
  }

  private buildNotifications(
    eventType: string,
    order: OrderContext,
    payload: Prisma.JsonValue,
  ) {
    const basePayload = {
      orderId: order.id,
      outboxPayload: payload,
    };

    switch (eventType) {
      case 'ORDER_CREATED':
        return [
          this.row(
            order.buyerId,
            eventType,
            'Order created',
            'Your purchase order was created.',
            basePayload,
          ),
          this.row(
            order.sellerId,
            eventType,
            'New order',
            'A buyer reserved your lot.',
            basePayload,
          ),
        ];
      case 'TRADE_OPERATION_CREATED':
        return [
          this.row(
            order.sellerId,
            eventType,
            'Trade required',
            'Please transfer the item to complete the deal.',
            basePayload,
          ),
        ];
      case 'ORDER_COMPLETED':
        return [
          this.row(
            order.buyerId,
            eventType,
            'Deal completed',
            'Your purchase is completed.',
            basePayload,
          ),
          this.row(
            order.sellerId,
            eventType,
            'Sale completed',
            'Your sale is completed.',
            basePayload,
          ),
        ];
      case 'ORDER_FAILED':
        return [
          this.row(
            order.buyerId,
            eventType,
            'Deal failed',
            'Your order failed and funds were released if applicable.',
            basePayload,
          ),
          this.row(
            order.sellerId,
            eventType,
            'Deal failed',
            'The order failed before completion.',
            basePayload,
          ),
        ];
      case 'ORDER_DISPUTE_OPENED':
        return [
          this.row(
            order.buyerId,
            eventType,
            'Dispute opened',
            'A dispute was opened for your order.',
            basePayload,
          ),
          this.row(
            order.sellerId,
            eventType,
            'Dispute opened',
            'A dispute was opened for your order.',
            basePayload,
          ),
        ];
      case 'SALE_SETTLED':
        return [
          this.row(
            order.sellerId,
            eventType,
            'Sale settled',
            'Sale funds were settled to your wallet.',
            basePayload,
          ),
        ];
      case 'SETTLEMENT_BLOCKED':
        return [
          this.row(
            order.buyerId,
            eventType,
            'Settlement blocked',
            'Trade confirmed but settlement was blocked by policy limits.',
            basePayload,
          ),
          this.row(
            order.sellerId,
            eventType,
            'Settlement blocked',
            'Trade confirmed but settlement was blocked by policy limits.',
            basePayload,
          ),
        ];
      default:
        return [];
    }
  }

  private row(
    userId: string,
    eventType: string,
    title: string,
    message: string,
    payload: object,
  ) {
    return {
      userId,
      eventType,
      title,
      message,
      payload,
    };
  }
}
