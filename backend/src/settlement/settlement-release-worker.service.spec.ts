import { OrderStatus } from '@prisma/client';
import { SettlementReleaseWorkerService } from './settlement-release-worker.service';

describe('SettlementReleaseWorkerService', () => {
  it('releases due holds in batch', async () => {
    const prisma = {
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'order-1' }, { id: 'order-2' }]),
      },
    };
    const settlementService = {
      releaseDueSettlementHold: jest
        .fn()
        .mockResolvedValueOnce({
          settled: true,
          inHold: false,
          guard: { allowed: true },
        })
        .mockResolvedValueOnce({
          settled: false,
          inHold: true,
          guard: { allowed: true },
        }),
    };
    const worker = new SettlementReleaseWorkerService(
      prisma as never,
      settlementService as never,
    );

    process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'true';
    const result = await worker.releaseDueHolds();

    expect(result).toEqual({ scanned: 2, released: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OrderStatus.SETTLEMENT_HOLD,
        }),
      }),
    );
    expect(settlementService.releaseDueSettlementHold).toHaveBeenCalledTimes(2);
    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
  });

  it('skips when hold window feature is disabled', async () => {
    const prisma = { order: { findMany: jest.fn() } };
    const settlementService = { releaseDueSettlementHold: jest.fn() };
    const worker = new SettlementReleaseWorkerService(
      prisma as never,
      settlementService as never,
    );

    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
    await worker.handleInterval();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
