import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAYMENT_RESERVED, OrderStatus.CANCELED],
  [OrderStatus.PAYMENT_RESERVED]: [
    OrderStatus.WAITING_TRADE,
    OrderStatus.CANCELED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.WAITING_TRADE]: [
    OrderStatus.TRADE_CONFIRMED,
    OrderStatus.FAILED,
    OrderStatus.DISPUTE,
    OrderStatus.CANCELED,
  ],
  [OrderStatus.TRADE_CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.DISPUTE],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.FAILED]: [],
  [OrderStatus.DISPUTE]: [OrderStatus.COMPLETED, OrderStatus.FAILED],
  [OrderStatus.CANCELED]: [],
};

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_RESERVED,
  OrderStatus.WAITING_TRADE,
  OrderStatus.TRADE_CONFIRMED,
  OrderStatus.DISPUTE,
];

@Injectable()
export class OrderStateService {
  ensureTransition(from: OrderStatus, to: OrderStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Order status transition not allowed: ${from} -> ${to}`,
      );
    }
  }

  isOpenStatus(status: OrderStatus): boolean {
    return OPEN_ORDER_STATUSES.includes(status);
  }

  async recordCreated(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId?: string | null,
  ): Promise<void> {
    await tx.orderStatusEvent.create({
      data: {
        orderId,
        fromStatus: null,
        toStatus: OrderStatus.CREATED,
        actorUserId: actorUserId ?? null,
        ...getAuditContext(),
      },
    });
  }

  async transition(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      from: OrderStatus;
      to: OrderStatus;
      actorUserId?: string | null;
      reason?: string | null;
      extra?: Omit<Prisma.OrderUpdateInput, 'status'>;
    },
  ): Promise<void> {
    this.ensureTransition(params.from, params.to);
    await tx.order.update({
      where: { id: params.orderId },
      data: { status: params.to, ...(params.extra ?? {}) },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.from,
        toStatus: params.to,
        actorUserId: params.actorUserId ?? null,
        reason: params.reason ?? null,
        ...getAuditContext(),
      },
    });
  }
}
