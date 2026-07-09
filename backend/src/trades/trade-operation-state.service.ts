import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, TradeOperationStatus } from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';

type TradeOperationEvent =
  | 'TRADE_CREATED'
  | 'DELIVERY_VERIFIED'
  | 'TIMEOUT'
  | 'MISMATCH_DETECTED'
  | 'UNKNOWN_STATE_DETECTED'
  | 'FAIL_SAFE';

type GuardContext = {
  deliveryVerified?: boolean;
};

type TransitionRule = {
  from: TradeOperationStatus;
  event: TradeOperationEvent;
  to: TradeOperationStatus;
  guard?: keyof GuardContext;
  action: string;
};

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: TradeOperationStatus.WAITING,
    event: 'DELIVERY_VERIFIED',
    to: TradeOperationStatus.DELIVERY_VERIFIED,
    guard: 'deliveryVerified',
    action: 'mark_delivery_verified',
  },
  {
    from: TradeOperationStatus.WAITING,
    event: 'TIMEOUT',
    to: TradeOperationStatus.TIMEOUT,
    action: 'mark_timeout',
  },
  {
    from: TradeOperationStatus.WAITING,
    event: 'MISMATCH_DETECTED',
    to: TradeOperationStatus.FAILED_DISPUTE,
    action: 'mark_mismatch_dispute',
  },
  {
    from: TradeOperationStatus.WAITING,
    event: 'UNKNOWN_STATE_DETECTED',
    to: TradeOperationStatus.FAILED_DISPUTE,
    action: 'mark_unknown_dispute',
  },
  {
    from: TradeOperationStatus.WAITING,
    event: 'FAIL_SAFE',
    to: TradeOperationStatus.FAILED_SAFE,
    action: 'mark_fail_safe',
  },
];

@Injectable()
export class TradeOperationStateService {
  private readonly logger = new Logger(TradeOperationStateService.name);

  async recordCreated(
    tx: Prisma.TransactionClient,
    tradeOperationId: string,
    actorUserId?: string | null,
  ): Promise<void> {
    await tx.tradeOperationStatusEvent.create({
      data: {
        tradeOperationId,
        fromStatus: null,
        toStatus: TradeOperationStatus.WAITING,
        event: 'TRADE_CREATED',
        actorUserId: actorUserId ?? null,
        ...getAuditContext(),
      },
    });
  }

  async transitionByEvent(
    tx: Prisma.TransactionClient,
    params: {
      tradeOperationId: string;
      from: TradeOperationStatus;
      event: TradeOperationEvent;
      actorUserId?: string | null;
      reason?: string | null;
      providerRef?: string | null;
      failReasonCode?: string | null;
      guards?: GuardContext;
    },
  ): Promise<TradeOperationStatus> {
    const rule = TRANSITION_RULES.find(
      (entry) => entry.from === params.from && entry.event === params.event,
    );

    if (!rule) {
      throw new BadRequestException(
        `Trade operation transition not allowed: ${params.from} + ${params.event}`,
      );
    }

    if (rule.guard && !params.guards?.[rule.guard]) {
      throw new BadRequestException(
        `Trade operation guard failed: ${String(rule.guard)}`,
      );
    }

    await tx.tradeOperation.update({
      where: { id: params.tradeOperationId },
      data: {
        status: rule.to,
        providerRef: params.providerRef ?? undefined,
        failReasonCode: params.failReasonCode ?? undefined,
      },
    });

    await tx.tradeOperationStatusEvent.create({
      data: {
        tradeOperationId: params.tradeOperationId,
        fromStatus: params.from,
        toStatus: rule.to,
        event: params.event,
        actorUserId: params.actorUserId ?? null,
        reason: params.reason ?? null,
        ...getAuditContext(),
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'trade_operation_transition',
        tradeOperationId: params.tradeOperationId,
        from: params.from,
        to: rule.to,
        transitionEvent: params.event,
        action: rule.action,
        guard: rule.guard ?? null,
      }),
    );

    return rule.to;
  }

  getTransitionTable(): TransitionRule[] {
    return [...TRANSITION_RULES];
  }
}
