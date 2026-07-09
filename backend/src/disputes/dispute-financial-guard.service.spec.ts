import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { DisputeFinancialGuardService } from './dispute-financial-guard.service';

describe('DisputeFinancialGuardService', () => {
  const guard = new DisputeFinancialGuardService();

  it('blocks buyer resolve when hold already captured', () => {
    expect(() =>
      guard.assertResolveBuyerAllowed({
        amountMinor: 100_000n,
        capturedMinor: 100_000n,
        releasedMinor: 0n,
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks seller resolve when amounts are unbalanced', () => {
    expect(() =>
      guard.assertResolveSellerAllowed(
        { amountMinor: 100_000n, capturedMinor: 0n, releasedMinor: 0n },
        { sellerReceiveMinor: 90_000n, commissionMinor: 5_000n },
      ),
    ).toThrow(BadRequestException);
  });

  it('blocks settlement hold reverse after release', () => {
    expect(() =>
      guard.assertReverseSettlementHoldAllowed(OrderStatus.SETTLEMENT_HOLD, {
        amountMinor: 100_000n,
        capturedMinor: 100_000n,
        releasedMinor: 0n,
        settlementReleasedAt: new Date(),
      }),
    ).toThrow(BadRequestException);
  });
});
