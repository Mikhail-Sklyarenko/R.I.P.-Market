import { BadRequestException } from '@nestjs/common';
import { WalletAccountType } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  let prisma: PrismaService;

  const buyerId = 'buyer-uuid';
  const sellerId = 'seller-uuid';
  const buyerWalletId = 'buyer-wallet';
  const sellerWalletId = 'seller-wallet';
  const platformWalletId = 'platform-wallet';

  const accounts = new Map<string, bigint>([
    [`${buyerWalletId}:${WalletAccountType.AVAILABLE}`, 10000n],
    [`${buyerWalletId}:${WalletAccountType.HOLD}`, 0n],
    [`${buyerWalletId}:${WalletAccountType.FROZEN}`, 0n],
    [`${sellerWalletId}:${WalletAccountType.AVAILABLE}`, 0n],
    [`${sellerWalletId}:${WalletAccountType.HOLD}`, 0n],
    [`${platformWalletId}:${WalletAccountType.AVAILABLE}`, 0n],
  ]);

  const ledgerEntries = new Map<string, unknown>();

  beforeEach(() => {
    ledgerEntries.clear();

    prisma = {
      wallet: {
        findUnique: jest.fn(
          async ({ where }: { where: { userId: string } }) => {
            if (where.userId === buyerId)
              return { id: buyerWalletId, userId: buyerId };
            if (where.userId === sellerId)
              return { id: sellerWalletId, userId: sellerId };
            return { id: platformWalletId, userId: 'platform' };
          },
        ),
        create: jest.fn(),
      },
      walletAccount: {
        upsert: jest.fn(),
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              walletId_type: { walletId: string; type: WalletAccountType };
            };
          }) => ({
            balanceMinor:
              accounts.get(
                `${where.walletId_type.walletId}:${where.walletId_type.type}`,
              ) ?? 0n,
          }),
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: {
              walletId_type: { walletId: string; type: WalletAccountType };
            };
            data: { balanceMinor: { increment?: bigint; decrement?: bigint } };
          }) => {
            const key = `${where.walletId_type.walletId}:${where.walletId_type.type}`;
            const current = accounts.get(key) ?? 0n;
            if (data.balanceMinor.increment !== undefined) {
              accounts.set(key, current + data.balanceMinor.increment);
            }
            if (data.balanceMinor.decrement !== undefined) {
              accounts.set(key, current - data.balanceMinor.decrement);
            }
          },
        ),
      },
      ledgerEntry: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              walletId_idempotencyKey: {
                walletId: string;
                idempotencyKey: string;
              };
            };
          }) =>
            ledgerEntries.get(
              `${where.walletId_idempotencyKey.walletId}:${where.walletId_idempotencyKey.idempotencyKey}`,
            ) ?? null,
        ),
        findMany: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const entry = { id: crypto.randomUUID(), ...data };
          ledgerEntries.set(`${data.walletId}:${data.idempotencyKey}`, entry);
          return entry;
        }),
      },
      user: {
        upsert: jest.fn(async () => ({ id: 'platform-user' })),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: PrismaService) => Promise<unknown>) =>
          callback(prisma),
      ),
    } as unknown as PrismaService;

    ledgerService = new LedgerService(prisma);
    jest.spyOn(ledgerService, 'ensurePlatformWallet').mockResolvedValue({
      id: platformWalletId,
      userId: 'platform-user',
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('moves funds from available to hold on reserve', async () => {
    await ledgerService.reservePurchaseHold({
      buyerUserId: buyerId,
      orderId: 'order-1',
      holdId: 'hold-1',
      amountMinor: 5000n,
      idempotencyKey: 'reserve-1',
    });

    expect(
      accounts.get(`${buyerWalletId}:${WalletAccountType.AVAILABLE}`),
    ).toBe(5000n);
    expect(accounts.get(`${buyerWalletId}:${WalletAccountType.HOLD}`)).toBe(
      5000n,
    );
  });

  it('rejects reserve when balance is insufficient', async () => {
    await expect(
      ledgerService.reservePurchaseHold({
        buyerUserId: buyerId,
        orderId: 'order-1',
        holdId: 'hold-1',
        amountMinor: 20000n,
        idempotencyKey: 'reserve-fail',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles sale with balanced distribution', async () => {
    accounts.set(`${buyerWalletId}:${WalletAccountType.AVAILABLE}`, 0n);
    accounts.set(`${buyerWalletId}:${WalletAccountType.HOLD}`, 10000n);

    await ledgerService.settleSale({
      buyerUserId: buyerId,
      sellerUserId: sellerId,
      orderId: 'order-1',
      holdId: 'hold-1',
      totalAmountMinor: 10000n,
      sellerReceiveMinor: 9500n,
      commissionMinor: 500n,
      idempotencyKey: 'settle-1',
    });

    expect(accounts.get(`${buyerWalletId}:${WalletAccountType.HOLD}`)).toBe(0n);
    expect(
      accounts.get(`${sellerWalletId}:${WalletAccountType.AVAILABLE}`),
    ).toBe(9500n);
    expect(
      accounts.get(`${platformWalletId}:${WalletAccountType.AVAILABLE}`),
    ).toBe(500n);
  });

  it('refunds hold back to available', async () => {
    accounts.set(`${buyerWalletId}:${WalletAccountType.AVAILABLE}`, 0n);
    accounts.set(`${buyerWalletId}:${WalletAccountType.HOLD}`, 7000n);

    await ledgerService.refundHold({
      buyerUserId: buyerId,
      orderId: 'order-1',
      holdId: 'hold-1',
      amountMinor: 7000n,
      idempotencyKey: 'refund-1',
    });

    expect(accounts.get(`${buyerWalletId}:${WalletAccountType.HOLD}`)).toBe(0n);
    expect(
      accounts.get(`${buyerWalletId}:${WalletAccountType.AVAILABLE}`),
    ).toBe(7000n);
  });
});
