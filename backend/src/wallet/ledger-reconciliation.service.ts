import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ReconciliationIssue = {
  code: string;
  message: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
};

export type ReconciliationReport = {
  ok: boolean;
  checkedAt: string;
  issueCount: number;
  issues: ReconciliationIssue[];
};

const OPEN_ORDER_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
  'DISPUTE',
]);

@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async runDailyJob(): Promise<void> {
    if (process.env.JEST_WORKER_ID) {
      return;
    }

    const report = await this.reconcile();
    if (report.ok) {
      this.logger.log(
        JSON.stringify({ event: 'ledger_reconciliation_ok', issueCount: 0 }),
      );
      return;
    }

    this.logger.error(
      JSON.stringify({
        event: 'ledger_reconciliation_failed',
        issueCount: report.issueCount,
        issues: report.issues,
      }),
    );

    await this.publishFailureAlert(report);
  }

  async publishFailureAlert(report: ReconciliationReport): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'RECONCILIATION_FAILED',
        aggregateType: 'reconciliation',
        aggregateId: `ledger-${report.checkedAt}`,
        payload: {
          checkedAt: report.checkedAt,
          issueCount: report.issueCount,
          issues: report.issues,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async reconcile(): Promise<ReconciliationReport> {
    const issues: ReconciliationIssue[] = [];
    const holds = await this.prisma.hold.findMany({
      include: {
        order: true,
        wallet: { include: { accounts: true, holds: true } },
      },
    });

    for (const hold of holds) {
      if (!hold.order) {
        issues.push({
          code: 'ORPHAN_HOLD',
          message: 'Hold exists without a matching order',
          entityType: 'hold',
          entityId: hold.id,
        });
        continue;
      }

      if (hold.amountMinor !== hold.order.holdAmountMinor) {
        issues.push({
          code: 'HOLD_ORDER_AMOUNT_MISMATCH',
          message: 'Hold amount does not match order holdAmountMinor',
          entityType: 'hold',
          entityId: hold.id,
          details: {
            holdAmountMinor: hold.amountMinor.toString(),
            orderHoldAmountMinor: hold.order.holdAmountMinor.toString(),
            orderId: hold.orderId,
          },
        });
      }

      const outstanding =
        hold.amountMinor - hold.capturedMinor - hold.releasedMinor;

      if (OPEN_ORDER_STATUSES.has(hold.order.status) && outstanding < 0n) {
        issues.push({
          code: 'HOLD_NEGATIVE_OUTSTANDING',
          message: 'Hold has negative outstanding balance for an open order',
          entityType: 'hold',
          entityId: hold.id,
          details: {
            outstanding: outstanding.toString(),
            orderStatus: hold.order.status,
          },
        });
      }

      if (
        hold.order.status === 'COMPLETED' &&
        hold.capturedMinor !== hold.amountMinor
      ) {
        issues.push({
          code: 'COMPLETED_ORDER_HOLD_NOT_CAPTURED',
          message: 'Completed order hold is not fully captured',
          entityType: 'hold',
          entityId: hold.id,
          details: {
            capturedMinor: hold.capturedMinor.toString(),
            amountMinor: hold.amountMinor.toString(),
          },
        });
      }

      if (
        (hold.order.status === 'FAILED' || hold.order.status === 'CANCELED') &&
        hold.releasedMinor !== hold.amountMinor
      ) {
        issues.push({
          code: 'TERMINAL_ORDER_HOLD_NOT_RELEASED',
          message: 'Failed/canceled order hold is not fully released',
          entityType: 'hold',
          entityId: hold.id,
          details: {
            releasedMinor: hold.releasedMinor.toString(),
            amountMinor: hold.amountMinor.toString(),
            orderStatus: hold.order.status,
          },
        });
      }
    }

    const openOrdersWithoutHold = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            'WAITING_TRADE',
            'TRADE_CONFIRMED',
            'DISPUTE',
            'PAYMENT_RESERVED',
          ],
        },
        hold: null,
      },
      select: { id: true, status: true },
    });

    for (const order of openOrdersWithoutHold) {
      issues.push({
        code: 'OPEN_ORDER_WITHOUT_HOLD',
        message: 'Open order is missing a hold record',
        entityType: 'order',
        entityId: order.id,
        details: { status: order.status },
      });
    }

    const ledgerWithOrder = await this.prisma.ledgerEntry.findMany({
      where: { orderId: { not: null } },
      select: { id: true, orderId: true },
    });

    const orderIds = new Set(
      (await this.prisma.order.findMany({ select: { id: true } })).map(
        (row) => row.id,
      ),
    );

    for (const entry of ledgerWithOrder) {
      if (entry.orderId && !orderIds.has(entry.orderId)) {
        issues.push({
          code: 'ORPHAN_LEDGER_ORDER_REF',
          message: 'Ledger entry references a missing order',
          entityType: 'ledger_entry',
          entityId: entry.id,
          details: { orderId: entry.orderId },
        });
      }
    }

    const ledgerWithHold = await this.prisma.ledgerEntry.findMany({
      where: { holdId: { not: null } },
      select: { id: true, holdId: true },
    });
    const holdIds = new Set(holds.map((hold) => hold.id));

    for (const entry of ledgerWithHold) {
      if (entry.holdId && !holdIds.has(entry.holdId)) {
        issues.push({
          code: 'ORPHAN_LEDGER_HOLD_REF',
          message: 'Ledger entry references a missing hold',
          entityType: 'ledger_entry',
          entityId: entry.id,
          details: { holdId: entry.holdId },
        });
      }
    }

    const wallets = await this.prisma.wallet.findMany({
      include: { accounts: true, holds: true },
    });

    for (const wallet of wallets) {
      const holdAccount = wallet.accounts.find(
        (account) => account.type === WalletAccountType.HOLD,
      );
      if (!holdAccount) {
        continue;
      }

      const expectedHoldBalance = wallet.holds.reduce((sum, hold) => {
        const outstanding =
          hold.amountMinor - hold.capturedMinor - hold.releasedMinor;
        return sum + (outstanding > 0n ? outstanding : 0n);
      }, 0n);

      if (holdAccount.balanceMinor !== expectedHoldBalance) {
        issues.push({
          code: 'WALLET_HOLD_BALANCE_MISMATCH',
          message:
            'Wallet HOLD account balance does not match outstanding holds',
          entityType: 'wallet',
          entityId: wallet.id,
          details: {
            accountBalanceMinor: holdAccount.balanceMinor.toString(),
            expectedHoldBalance: expectedHoldBalance.toString(),
          },
        });
      }
    }

    return {
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
      issueCount: issues.length,
      issues,
    };
  }
}
