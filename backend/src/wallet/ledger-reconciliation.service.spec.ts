import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('LedgerReconciliationService', () => {
  let service: LedgerReconciliationService;
  let prisma: PrismaService;
  let transaction: jest.Mock;

  beforeEach(() => {
    prisma = {
      hold: { findMany: jest.fn(async () => []) },
      order: { findMany: jest.fn(async () => []) },
      ledgerEntry: { findMany: jest.fn(async () => []) },
      wallet: { findMany: jest.fn(async () => []) },
      cryptoWithdrawal: { findMany: jest.fn(async () => []) },
      withdrawalRequest: { findMany: jest.fn(async () => []) },
      buyRequest: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    transaction = jest.fn(
      async (read: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        read(prisma),
    );
    prisma.$transaction = transaction;

    service = new LedgerReconciliationService(prisma);
  });

  it('returns ok when there are no holds or orphan references', async () => {
    const report = await service.reconcile();
    expect(report.ok).toBe(true);
    expect(report.issueCount).toBe(0);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    });
  });

  function walletFixture(
    balance: bigint | null,
    reserved: bigint,
    status = 'OPEN',
  ) {
    (prisma.buyRequest.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'request-1',
        buyerId: 'buyer-1',
        status,
        reservedAmountMinor: reserved,
      },
    ]);
    (prisma.wallet.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'wallet-1',
        userId: 'buyer-1',
        accounts:
          balance === null ? [] : [{ type: 'HOLD', balanceMinor: balance }],
        holds: [
          { amountMinor: 1000n, capturedMinor: 200n, releasedMinor: 100n },
        ],
      },
    ]);
  }

  it('includes remaining buy request funds alongside outstanding order holds', async () => {
    walletFixture(2700n, 2000n);
    expect((await service.reconcile()).ok).toBe(true);
  });

  it('still detects missing money when buy requests exist', async () => {
    walletFixture(700n, 2000n);
    expect((await service.reconcile()).issues).toContainEqual(
      expect.objectContaining({
        code: 'WALLET_HOLD_BALANCE_MISMATCH',
        details: { accountBalanceMinor: '700', expectedHoldBalance: '2700' },
      }),
    );
  });

  it('does not mix reserves belonging to different buyers', async () => {
    walletFixture(700n, 2000n);
    (prisma.buyRequest.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'request-2',
        buyerId: 'buyer-2',
        status: 'OPEN',
        reservedAmountMinor: 2000n,
      },
    ]);
    // A second wallet backs the second buyer's reserve.
    const first = await prisma.wallet.findMany();
    (prisma.wallet.findMany as jest.Mock).mockResolvedValue([
      ...first,
      {
        id: 'wallet-2',
        userId: 'buyer-2',
        accounts: [{ type: 'HOLD', balanceMinor: 2000n }],
        holds: [],
      },
    ]);
    expect((await service.reconcile()).ok).toBe(true);
  });

  it('detects a missing HOLD account instead of skipping reserved funds', async () => {
    walletFixture(null, 2000n);
    expect((await service.reconcile()).issues).toContainEqual(
      expect.objectContaining({
        code: 'WALLET_HOLD_ACCOUNT_MISSING',
        entityId: 'wallet-1',
      }),
    );
  });

  it.each(['CANCELED', 'EXPIRED', 'FULFILLED'])(
    'detects unreleased reserve for %s requests',
    async (status) => {
      walletFixture(2700n, 2000n, status);
      expect((await service.reconcile()).issues).toContainEqual(
        expect.objectContaining({
          code: 'BUY_REQUEST_RESERVE_INVALID',
          entityId: 'request-1',
        }),
      );
    },
  );

  it('detects negative request reserves instead of offsetting another obligation', async () => {
    walletFixture(700n, -100n);
    expect((await service.reconcile()).issues).toContainEqual(
      expect.objectContaining({
        code: 'BUY_REQUEST_RESERVE_INVALID',
      }),
    );
  });

  it('detects over-release even after an order is completed', async () => {
    (prisma.hold.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'hold-1',
        orderId: 'order-1',
        amountMinor: 1000n,
        capturedMinor: 1000n,
        releasedMinor: 100n,
        order: { id: 'order-1', holdAmountMinor: 1000n, status: 'COMPLETED' },
      },
    ]);
    expect((await service.reconcile()).issues).toContainEqual(
      expect.objectContaining({
        code: 'HOLD_NEGATIVE_OUTSTANDING',
        entityId: 'hold-1',
      }),
    );
  });

  it('detects orphan hold without order', async () => {
    prisma.hold.findMany = jest.fn(async () => [
      {
        id: 'hold-1',
        orderId: 'missing-order',
        amountMinor: 1000n,
        capturedMinor: 0n,
        releasedMinor: 0n,
        order: null,
        wallet: { id: 'wallet-1', accounts: [], holds: [] },
      },
    ]) as typeof prisma.hold.findMany;

    const report = await service.reconcile();
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ORPHAN_HOLD', entityId: 'hold-1' }),
      ]),
    );
  });

  it('alerts when a settlement-held order has lost its hold record', async () => {
    const order = { id: 'held-order', status: 'SETTLEMENT_HOLD' };
    prisma.order.findMany = jest.fn(
      async (args?: {
        where?: { status?: { in?: string[] }; hold?: null };
      }) => {
        const statuses = args?.where?.status?.in;
        return args?.where?.hold === null
          ? statuses?.includes(order.status)
            ? [order]
            : []
          : [order];
      },
    ) as unknown as typeof prisma.order.findMany;

    const report = await service.reconcile();
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'OPEN_ORDER_WITHOUT_HOLD',
        entityId: order.id,
      }),
    );
  });

  it('detects hold/order amount mismatch', async () => {
    prisma.hold.findMany = jest.fn(async () => [
      {
        id: 'hold-1',
        orderId: 'order-1',
        amountMinor: 1000n,
        capturedMinor: 0n,
        releasedMinor: 0n,
        order: {
          id: 'order-1',
          holdAmountMinor: 2000n,
          status: 'WAITING_TRADE',
        },
        wallet: { id: 'wallet-1', accounts: [], holds: [] },
      },
    ]) as typeof prisma.hold.findMany;

    const report = await service.reconcile();
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HOLD_ORDER_AMOUNT_MISMATCH' }),
      ]),
    );
  });
});
