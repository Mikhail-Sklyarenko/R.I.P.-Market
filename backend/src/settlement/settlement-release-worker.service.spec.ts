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

    process.env.ENABLE_REAL_SETTLEMENT = 'true';
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
    delete process.env.ENABLE_REAL_SETTLEMENT;
    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
  });

  it('skips when hold window feature is disabled', async () => {
    const prisma = { order: { findMany: jest.fn() } };
    const settlementService = { releaseDueSettlementHold: jest.fn() };
    const worker = new SettlementReleaseWorkerService(
      prisma as never,
      settlementService as never,
    );

    delete process.env.ENABLE_REAL_SETTLEMENT;
    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
    await worker.handleInterval();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});

it.each([0, 18, 19])(
  'protection retry %s ignores 25 previous delivery polls',
  async (retries) => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'held-order' }]) },
      tradeOperation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'op', checkCount: 25 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tradePollEvent: {
        count: jest.fn().mockResolvedValue(retries),
        create: jest.fn(),
      },
    };
    const settlement = {
      releaseDueSettlementHold: jest.fn().mockResolvedValue({
        settled: false,
        guard: { allowed: false, code: 'STEAM_RECHECK_UNAVAILABLE' },
      }),
    };
    process.env.ENABLE_REAL_SETTLEMENT = 'true';
    try {
      await new SettlementReleaseWorkerService(
        prisma as never,
        settlement as never,
      ).releaseDueHolds();
      expect(prisma.tradeOperation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStage:
              retries === 19 ? 'MANUAL_REVIEW' : 'PROTECTION_RECHECK',
          }),
        }),
      );
      expect(prisma.tradePollEvent.count).toHaveBeenCalledWith({
        where: {
          tradeOperationId: 'op',
          strategy: 'SETTLEMENT_PROTECTION_RECHECK',
        },
      });
      expect(
        prisma.tradeOperation.updateMany.mock.calls[0][0].data,
      ).not.toHaveProperty('checkCount');
    } finally {
      delete process.env.ENABLE_REAL_SETTLEMENT;
    }
  },
);
