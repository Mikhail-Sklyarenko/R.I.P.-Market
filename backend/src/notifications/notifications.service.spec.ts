import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  it('creates buyer and seller notifications for ORDER_CREATED', async () => {
    const createMany = jest.fn();
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        }),
      },
      notification: { createMany },
    } as unknown as PrismaService;

    const service = new NotificationsService(prisma);
    await service.createFromOutboxEvent(
      'ORDER_CREATED',
      'order',
      'order-1',
      {},
    );

    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'buyer-1',
          eventType: 'ORDER_CREATED',
        }),
        expect.objectContaining({
          userId: 'seller-1',
          eventType: 'ORDER_CREATED',
        }),
      ]),
    });
  });

  it('notifies admins for reconciliation failures', async () => {
    const createMany = jest.fn();
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
      },
      notification: { createMany },
    } as unknown as PrismaService;

    const service = new NotificationsService(prisma);
    await service.createFromOutboxEvent(
      'RECONCILIATION_FAILED',
      'reconciliation',
      'ledger-2026-01-01',
      { issueCount: 2, issues: [] },
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'admin-1',
          eventType: 'RECONCILIATION_FAILED',
          title: 'Ledger reconciliation failed',
        }),
      ],
    });
  });
});
