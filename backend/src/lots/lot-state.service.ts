import { BadRequestException, Injectable } from '@nestjs/common';
import { LotStatus, Prisma } from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';

const ALLOWED_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  [LotStatus.DRAFT]: [LotStatus.ACTIVE, LotStatus.CANCELED, LotStatus.BLOCKED],
  [LotStatus.ACTIVE]: [
    LotStatus.RESERVED,
    LotStatus.CANCELED,
    LotStatus.BLOCKED,
  ],
  [LotStatus.RESERVED]: [LotStatus.ACTIVE, LotStatus.SOLD, LotStatus.BLOCKED],
  [LotStatus.SOLD]: [],
  [LotStatus.CANCELED]: [],
  [LotStatus.BLOCKED]: [LotStatus.ACTIVE, LotStatus.SOLD],
};

@Injectable()
export class LotStateService {
  ensureTransition(from: LotStatus, to: LotStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Lot status transition not allowed: ${from} -> ${to}`,
      );
    }
  }

  async recordListed(
    tx: Prisma.TransactionClient,
    lotId: string,
    sellerId: string,
  ): Promise<void> {
    await tx.lotStatusEvent.create({
      data: {
        lotId,
        fromStatus: null,
        toStatus: LotStatus.ACTIVE,
        actorUserId: sellerId,
        ...getAuditContext(),
      },
    });
  }

  async transition(
    tx: Prisma.TransactionClient,
    params: {
      lotId: string;
      from: LotStatus;
      to: LotStatus;
      actorUserId?: string | null;
      reason?: string | null;
      extra?: Omit<Prisma.LotUpdateInput, 'status'>;
    },
  ): Promise<void> {
    this.ensureTransition(params.from, params.to);
    await tx.lot.update({
      where: { id: params.lotId },
      data: { status: params.to, ...(params.extra ?? {}) },
    });
    await tx.lotStatusEvent.create({
      data: {
        lotId: params.lotId,
        fromStatus: params.from,
        toStatus: params.to,
        actorUserId: params.actorUserId ?? null,
        reason: params.reason ?? null,
        ...getAuditContext(),
      },
    });
  }
}
