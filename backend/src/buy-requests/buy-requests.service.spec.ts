import { UserStatus } from '@prisma/client';
import { BuyRequestsService } from './buy-requests.service';
import { ErrorCode } from '../common/errors/error-codes';

describe('BuyRequestsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    itemDefinition: { findUnique: jest.fn() },
    buyRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const buyRequestMatching = {
    matchBuyRequestCreated: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BuyRequestsService(
    prisma as never,
    buyRequestMatching as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an open buy request for an item', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      status: UserStatus.ACTIVE,
    });
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'item-1',
      marketHashName: 'Revolution Case',
    });
    prisma.buyRequest.findFirst.mockResolvedValue(null);
    prisma.buyRequest.create.mockResolvedValue({
      id: 'req-1',
      buyerId: 'buyer-1',
      itemDefinitionId: 'item-1',
      maxPriceMinor: 500n,
      status: 'OPEN',
      itemDefinition: { id: 'item-1', marketHashName: 'Revolution Case' },
    });

    const result = await service.create('buyer-1', 'item-1', { maxPriceMinor: 500 });

    expect(result).toMatchObject({
      id: 'req-1',
      status: 'OPEN',
    });
    expect(prisma.buyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerId: 'buyer-1',
          itemDefinitionId: 'item-1',
          maxPriceMinor: 500n,
        }),
      }),
    );
  });

  it('rejects duplicate open buy requests', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      status: UserStatus.ACTIVE,
    });
    prisma.itemDefinition.findUnique.mockResolvedValue({ id: 'item-1' });
    prisma.buyRequest.findFirst.mockResolvedValue({ id: 'req-existing' });

    await expect(service.create('buyer-1', 'item-1', {})).rejects.toMatchObject({
      code: ErrorCode.BUY_REQUEST_ALREADY_OPEN,
    });
  });
});
