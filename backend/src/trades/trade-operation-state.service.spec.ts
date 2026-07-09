import { BadRequestException } from '@nestjs/common';
import { TradeOperationStatus } from '@prisma/client';
import { TradeOperationStateService } from './trade-operation-state.service';

describe('TradeOperationStateService', () => {
  const service = new TradeOperationStateService();

  it('contains WAITING -> DELIVERY_VERIFIED transition', () => {
    const rule = service
      .getTransitionTable()
      .find(
        (entry) =>
          entry.from === TradeOperationStatus.WAITING &&
          entry.event === 'DELIVERY_VERIFIED' &&
          entry.to === TradeOperationStatus.DELIVERY_VERIFIED,
      );
    expect(rule).toBeDefined();
  });

  it('blocks WAITING -> DELIVERY_VERIFIED without guard', async () => {
    const tx = {
      tradeOperation: { update: jest.fn() },
      tradeOperationStatusEvent: { create: jest.fn() },
    } as never;

    await expect(
      service.transitionByEvent(tx, {
        tradeOperationId: 'trade-op-1',
        from: TradeOperationStatus.WAITING,
        event: 'DELIVERY_VERIFIED',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
