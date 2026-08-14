import { UserStatus } from '@prisma/client';
import { BuyRequestsService } from './buy-requests.service';
import { ErrorCode } from '../common/errors/error-codes';

describe('BuyRequestsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    itemDefinition: { findUnique: jest.fn(), upsert: jest.fn() },
    buyRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const buyRequestMatching = {
    matchBuyRequestCreated: jest.fn().mockResolvedValue(undefined),
  };

  const ledger = {
    reserveBuyRequestHold: jest.fn().mockResolvedValue(undefined),
    releaseBuyRequestHold: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BuyRequestsService(
    prisma as never,
    buyRequestMatching as never,
    ledger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
  });

  it('creates an open buy request with balance hold', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      status: UserStatus.ACTIVE,
    });
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'item-1',
      marketHashName: 'Revolution Case',
      catalogSeeded: false,
      availableWears: [],
    });
    prisma.buyRequest.findFirst.mockResolvedValue(null);
    prisma.buyRequest.create.mockResolvedValue({
      id: 'req-1',
      buyerId: 'buyer-1',
      itemDefinitionId: 'item-1',
      maxPriceMinor: 500n,
      quantity: 2,
      quantityFilled: 0,
      reservedAmountMinor: 1000n,
      status: 'OPEN',
    });
    prisma.buyRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'req-1',
      buyerId: 'buyer-1',
      itemDefinitionId: 'item-1',
      maxPriceMinor: 500n,
      quantity: 2,
      quantityFilled: 0,
      reservedAmountMinor: 1000n,
      status: 'OPEN',
      itemDefinition: { id: 'item-1', marketHashName: 'Revolution Case' },
    });

    const result = await service.create('buyer-1', 'item-1', {
      maxPriceMinor: 500,
      quantity: 2,
    });

    expect(result).toMatchObject({
      id: 'req-1',
      status: 'OPEN',
      quantity: 2,
    });
    expect(ledger.reserveBuyRequestHold).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerUserId: 'buyer-1',
        buyRequestId: 'req-1',
        amountMinor: 1000n,
      }),
    );
  });

  it('rejects duplicate open buy requests at the same price', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      status: UserStatus.ACTIVE,
    });
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'item-1',
      catalogSeeded: false,
      availableWears: [],
    });
    prisma.buyRequest.findFirst.mockResolvedValue({ id: 'req-existing' });

    await expect(
      service.create('buyer-1', 'item-1', { maxPriceMinor: 500 }),
    ).rejects.toMatchObject({
      code: ErrorCode.BUY_REQUEST_ALREADY_OPEN,
    });
  });

  it('maps insufficient balance to INSUFFICIENT_BALANCE', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      status: UserStatus.ACTIVE,
    });
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'item-1',
      catalogSeeded: false,
      availableWears: [],
    });
    prisma.buyRequest.findFirst.mockResolvedValue(null);
    prisma.buyRequest.create.mockResolvedValue({ id: 'req-1' });
    ledger.reserveBuyRequestHold.mockRejectedValue(
      new Error('Insufficient available balance'),
    );

    await expect(
      service.create('buyer-1', 'item-1', { maxPriceMinor: 500 }),
    ).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_BALANCE,
    });
  });
});
