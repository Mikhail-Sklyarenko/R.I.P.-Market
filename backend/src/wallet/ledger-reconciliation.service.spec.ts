import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LedgerReconciliationService', () => {
  let service: LedgerReconciliationService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      hold: { findMany: jest.fn(async () => []) },
      order: { findMany: jest.fn(async () => []) },
      ledgerEntry: { findMany: jest.fn(async () => []) },
      wallet: { findMany: jest.fn(async () => []) },
      cryptoWithdrawal: { findMany: jest.fn(async () => []) },
      withdrawalRequest: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;

    service = new LedgerReconciliationService(prisma);
  });

  it('returns ok when there are no holds or orphan references', async () => {
    const report = await service.reconcile();
    expect(report.ok).toBe(true);
    expect(report.issueCount).toBe(0);
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
