import { UserRole, UserStatus } from '@prisma/client';
import { WithdrawalGuardService } from './withdrawal-guard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WithdrawalGuardService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createService(prisma: Partial<PrismaService>) {
    return new WithdrawalGuardService(prisma as PrismaService);
  }

  it('requires steam link when configured', async () => {
    process.env.WITHDRAW_REQUIRE_STEAM_LINKED = 'true';
    process.env.WITHDRAW_MANUAL_REVIEW = 'false';

    const service = createService({
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          steamId: null,
          role: UserRole.SELLER,
          status: UserStatus.ACTIVE,
        })),
      },
    });

    await expect(
      service.validateAndResolveReview('user-1', 3000n),
    ).rejects.toThrow('Steam account must be linked');
  });

  it('rejects suspended accounts', async () => {
    process.env.WITHDRAW_REQUIRE_STEAM_LINKED = 'false';
    process.env.WITHDRAW_MANUAL_REVIEW = 'false';

    const service = createService({
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          steamId: '76561198000000000',
          role: UserRole.SELLER,
          status: UserStatus.SUSPENDED,
        })),
      },
    });

    await expect(
      service.validateAndResolveReview('user-1', 3000n),
    ).rejects.toThrow('Account is suspended');
  });

  it('flags first withdrawals for manual review', async () => {
    process.env.WITHDRAW_MANUAL_REVIEW = 'true';
    process.env.WITHDRAW_MANUAL_REVIEW_COUNT = '3';
    process.env.WITHDRAW_REQUIRE_STEAM_LINKED = 'false';
    process.env.WITHDRAW_DAILY_CAP_MINOR = '0';

    const service = createService({
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          steamId: '76561198000000001',
          role: UserRole.BUYER,
          status: UserStatus.ACTIVE,
        })),
      },
      order: { count: jest.fn(async () => 0) },
      withdrawalRequest: {
        aggregate: jest.fn(async () => ({ _sum: { amountMinor: 0n } })),
        count: jest.fn(async () => 1),
      },
    });

    const result = await service.validateAndResolveReview('user-1', 3000n);
    expect(result.needsManualReview).toBe(true);
    expect(result.priorWithdrawalCount).toBe(1);
  });
});
