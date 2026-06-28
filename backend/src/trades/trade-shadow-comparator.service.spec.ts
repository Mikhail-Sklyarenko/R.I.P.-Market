import { TradeShadowComparatorService } from './trade-shadow-comparator.service';
import { TradeShadowMetricsService } from './trade-shadow-metrics.service';

describe('TradeShadowComparatorService', () => {
  const metrics = new TradeShadowMetricsService();
  let prisma: {
    tradeVerificationSnapshot: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    outboxEvent: { create: jest.Mock };
  };
  let service: TradeShadowComparatorService;

  beforeEach(() => {
    prisma = {
      tradeVerificationSnapshot: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
    };
    service = new TradeShadowComparatorService(prisma as never, metrics);
  });

  it('records STEAM_POLL snapshot without comparison baseline', async () => {
    prisma.tradeVerificationSnapshot.create.mockResolvedValue({
      id: 'snap-1',
      match: true,
    });

    await service.recordSnapshot({
      orderId: 'order-1',
      source: 'STEAM_POLL',
      observedStatus: 'accepted',
    });

    expect(prisma.tradeVerificationSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          observedStatus: 'accepted',
          expectedStatus: null,
          match: true,
        }),
      }),
    );
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('emits mismatch outbox when mock accepted differs from steam pending', async () => {
    prisma.tradeVerificationSnapshot.findFirst.mockResolvedValue({
      observedStatus: 'pending',
    });
    prisma.tradeVerificationSnapshot.create.mockResolvedValue({
      id: 'snap-2',
      source: 'MOCK_MANUAL',
      observedStatus: 'accepted',
      expectedStatus: 'pending',
      match: false,
    });

    await service.recordSnapshot({
      orderId: 'order-1',
      source: 'MOCK_MANUAL',
      observedStatus: 'accepted',
    });

    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'TRADE_SHADOW_MISMATCH',
          aggregateId: 'order-1',
        }),
      }),
    );
    expect(metrics.snapshot().trade_shadow_mismatch_total).toBeGreaterThan(0);
  });
});
