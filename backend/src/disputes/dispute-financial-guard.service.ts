import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

export type HoldFinancialSnapshot = {
  amountMinor: bigint;
  capturedMinor: bigint;
  releasedMinor: bigint;
  settlementReleasedAt?: Date | null;
};

export type LotFinancialSnapshot = {
  sellerReceiveMinor: bigint;
  commissionMinor: bigint;
};

@Injectable()
export class DisputeFinancialGuardService {
  assertResolveBuyerAllowed(hold: HoldFinancialSnapshot): void {
    if (hold.capturedMinor > 0n) {
      throw new BadRequestException(
        'Cannot refund buyer: hold funds were already captured/settled',
      );
    }
    const refundable = hold.amountMinor - hold.releasedMinor;
    if (refundable <= 0n) {
      throw new BadRequestException('Hold has no refundable balance');
    }
  }

  assertResolveSellerAllowed(
    hold: HoldFinancialSnapshot,
    lot: LotFinancialSnapshot,
  ): void {
    if (hold.capturedMinor > 0n) {
      throw new BadRequestException(
        'Cannot settle for seller: hold was already captured',
      );
    }
    if (lot.sellerReceiveMinor + lot.commissionMinor !== hold.amountMinor) {
      throw new BadRequestException('Settlement amounts are not balanced');
    }
  }

  assertReverseSettlementHoldAllowed(
    orderStatus: OrderStatus,
    hold: HoldFinancialSnapshot,
  ): void {
    if (orderStatus !== OrderStatus.SETTLEMENT_HOLD) {
      throw new BadRequestException(
        'Settlement hold can only be reversed from SETTLEMENT_HOLD',
      );
    }
    if (hold.capturedMinor > 0n || hold.settlementReleasedAt) {
      throw new BadRequestException(
        'Settlement hold was already released to seller',
      );
    }
  }
}
