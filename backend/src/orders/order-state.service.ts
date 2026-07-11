import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';

type OrderTransitionEvent =
  | 'ORDER_CREATED'
  | 'PAYMENT_RESERVED'
  | 'TRADE_OPERATION_CREATED'
  | 'DELIVERY_VERIFIED'
  | 'SETTLEMENT_STARTED'
  | 'SETTLEMENT_RELEASED'
  | 'SETTLEMENT_REVERSED'
  | 'TIMEOUT_DETECTED'
  | 'MISMATCH_DETECTED'
  | 'UNKNOWN_STATE_DETECTED'
  | 'CANCEL'
  | 'FAIL_SAFE'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED_BUYER'
  | 'DISPUTE_RESOLVED_SELLER'
  | 'LEGACY_SETTLED';

type GuardContext = {
  deliveryVerified?: boolean;
};

type TransitionRule = {
  from: OrderStatus;
  event: OrderTransitionEvent;
  to: OrderStatus;
  guard?: keyof GuardContext;
  action: string;
};

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: OrderStatus.CREATED,
    event: 'PAYMENT_RESERVED',
    to: OrderStatus.PAYMENT_RESERVED,
    action: 'reserve_payment',
  },
  {
    from: OrderStatus.PAYMENT_RESERVED,
    event: 'TRADE_OPERATION_CREATED',
    to: OrderStatus.WAITING_TRADE,
    action: 'start_waiting_trade',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'DELIVERY_VERIFIED',
    to: OrderStatus.TRADE_CONFIRMED,
    action: 'mark_trade_confirmed',
  },
  {
    from: OrderStatus.TRADE_CONFIRMED,
    event: 'SETTLEMENT_STARTED',
    to: OrderStatus.SETTLEMENT_HOLD,
    guard: 'deliveryVerified',
    action: 'enter_settlement_hold',
  },
  {
    from: OrderStatus.SETTLEMENT_HOLD,
    event: 'SETTLEMENT_RELEASED',
    to: OrderStatus.COMPLETED,
    guard: 'deliveryVerified',
    action: 'release_settlement',
  },
  {
    from: OrderStatus.TRADE_CONFIRMED,
    event: 'LEGACY_SETTLED',
    to: OrderStatus.COMPLETED,
    action: 'legacy_direct_settlement',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'TIMEOUT_DETECTED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_timeout',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'MISMATCH_DETECTED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_mismatch',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'UNKNOWN_STATE_DETECTED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_unknown',
  },
  {
    from: OrderStatus.TRADE_CONFIRMED,
    event: 'UNKNOWN_STATE_DETECTED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_unknown',
  },
  {
    from: OrderStatus.SETTLEMENT_HOLD,
    event: 'SETTLEMENT_REVERSED',
    to: OrderStatus.DISPUTE,
    action: 'reverse_settlement_hold',
  },
  {
    from: OrderStatus.SETTLEMENT_HOLD,
    event: 'UNKNOWN_STATE_DETECTED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_unknown',
  },
  {
    from: OrderStatus.CREATED,
    event: 'CANCEL',
    to: OrderStatus.CANCELED,
    action: 'cancel_order',
  },
  {
    from: OrderStatus.PAYMENT_RESERVED,
    event: 'CANCEL',
    to: OrderStatus.CANCELED,
    action: 'cancel_order',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'CANCEL',
    to: OrderStatus.CANCELED,
    action: 'cancel_order',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'FAIL_SAFE',
    to: OrderStatus.FAILED,
    action: 'fail_safe_refund',
  },
  {
    from: OrderStatus.WAITING_TRADE,
    event: 'DISPUTE_OPENED',
    to: OrderStatus.DISPUTE,
    action: 'open_dispute_manual',
  },
  {
    from: OrderStatus.DISPUTE,
    event: 'DISPUTE_RESOLVED_BUYER',
    to: OrderStatus.FAILED,
    action: 'resolve_dispute_buyer',
  },
  {
    from: OrderStatus.DISPUTE,
    event: 'DISPUTE_RESOLVED_SELLER',
    to: OrderStatus.COMPLETED,
    action: 'resolve_dispute_seller',
  },
];

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
  [OrderStatus.TRADE_CONFIRMED]: [
    OrderStatus.SETTLEMENT_HOLD,
    OrderStatus.COMPLETED,
    OrderStatus.DISPUTE,
  ],
  [OrderStatus.SETTLEMENT_HOLD]: [OrderStatus.COMPLETED, OrderStatus.DISPUTE],
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
  OrderStatus.SETTLEMENT_HOLD,
  OrderStatus.DISPUTE,
];

@Injectable()
export class OrderStateService {
  private readonly logger = new Logger(OrderStateService.name);

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

  async transitionByEvent(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      from: OrderStatus;
      event: OrderTransitionEvent;
      actorUserId?: string | null;
      reason?: string | null;
      guards?: GuardContext;
      extra?: Omit<Prisma.OrderUpdateInput, 'status'>;
    },
  ): Promise<OrderStatus> {
    const rule = TRANSITION_RULES.find(
      (entry) => entry.from === params.from && entry.event === params.event,
    );
    if (!rule) {
      throw new BadRequestException(
        `Order status transition not allowed: ${params.from} + ${params.event}`,
      );
    }
    if (rule.guard && !params.guards?.[rule.guard]) {
      throw new BadRequestException(
        `Order guard failed: ${String(rule.guard)}`,
      );
    }

    await this.transition(tx, {
      orderId: params.orderId,
      from: params.from,
      to: rule.to,
      actorUserId: params.actorUserId,
      reason: params.reason ?? params.event,
      extra: params.extra,
    });
    this.logger.log(
      JSON.stringify({
        event: 'order_transition',
        orderId: params.orderId,
        from: params.from,
        to: rule.to,
        transitionEvent: params.event,
        action: rule.action,
        guard: rule.guard ?? null,
        disputeAlert: rule.to === OrderStatus.DISPUTE,
      }),
    );
    return rule.to;
  }

  getTransitionTable(): TransitionRule[] {
    return [...TRANSITION_RULES];
  }
}
