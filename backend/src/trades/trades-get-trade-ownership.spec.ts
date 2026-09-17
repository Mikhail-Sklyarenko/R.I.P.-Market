import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TradesService } from './trades.service';

describe('TradesService.getTradeById ownership', () => {
  const prisma = {
    tradeOperation: {
      findUnique: jest.fn(),
    },
  };

  const service = new TradesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects strangers', async () => {
    prisma.tradeOperation.findUnique.mockResolvedValue({
      id: 't1',
      order: { buyerId: 'buyer', sellerId: 'seller', hold: null, lot: null },
    });
    await expect(
      service.getTradeById('t1', 'stranger', UserRole.BUYER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows buyer party', async () => {
    prisma.tradeOperation.findUnique.mockResolvedValue({
      id: 't1',
      order: { buyerId: 'buyer', sellerId: 'seller', hold: null, lot: null },
    });
    const result = await service.getTradeById('t1', 'buyer', UserRole.BUYER);
    expect(result.id).toBe('t1');
  });

  it('404 when missing', async () => {
    prisma.tradeOperation.findUnique.mockResolvedValue(null);
    await expect(
      service.getTradeById('missing', 'buyer', UserRole.BUYER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
