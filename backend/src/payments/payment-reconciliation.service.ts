import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';
import { isCryptoPaymentProvider } from '../providers/payment/payment.config';
import { sunToUsdMinor } from '../providers/payment/payment.util';
import { PAYMENT_PROVIDER } from '../providers/tokens';

export type PaymentReconciliationIssue = {
  code: string;
  message: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
};

export type PaymentReconciliationReport = {
  ok: boolean;
  checkedAt: string;
  issueCount: number;
  issues: PaymentReconciliationIssue[];
};

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  @Cron('0 4 * * *')
  async runDailyJob(): Promise<void> {
    if (process.env.JEST_WORKER_ID) {
      return;
    }

    if (!isCryptoPaymentProvider()) {
      return;
    }

    const report = await this.reconcile();
    if (report.ok) {
      this.logger.log(
        JSON.stringify({ event: 'payment_reconciliation_ok', issueCount: 0 }),
      );
      return;
    }

    this.logger.error(
      JSON.stringify({
        event: 'payment_reconciliation_failed',
        issueCount: report.issueCount,
        issues: report.issues,
      }),
    );

    await this.publishFailureAlert(report);
  }

  async publishFailureAlert(
    report: PaymentReconciliationReport,
  ): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'PAYMENT_RECONCILIATION_FAILED',
        aggregateType: 'reconciliation',
        aggregateId: `payments-${report.checkedAt}`,
        payload: {
          checkedAt: report.checkedAt,
          issueCount: report.issueCount,
          issues: report.issues,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async reconcile(): Promise<PaymentReconciliationReport> {
    const issues: PaymentReconciliationIssue[] = [];

    if (!isCryptoPaymentProvider()) {
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        issueCount: 0,
        issues: [],
      };
    }

    issues.push(...(await this.reconcileDepositEvents()));
    issues.push(...(await this.reconcileUserDeposits()));
    issues.push(...(await this.reconcileUserWithdrawals()));

    return {
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
      issueCount: issues.length,
      issues,
    };
  }

  private async reconcileDepositEvents(): Promise<
    PaymentReconciliationIssue[]
  > {
    const issues: PaymentReconciliationIssue[] = [];
    const depositEvents = await this.prisma.paymentEvent.findMany({
      where: { eventType: 'deposit.credited' },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const ledgerDeposits = await this.prisma.ledgerEntry.findMany({
      where: { type: LedgerEntryType.DEPOSIT },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    for (const event of depositEvents) {
      const txHash = this.readTxHash(event.payload);
      if (!txHash) {
        continue;
      }

      const ledgerMatch = ledgerDeposits.find((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        return metadata?.txHash === txHash;
      });

      if (!ledgerMatch) {
        issues.push({
          code: 'DEPOSIT_EVENT_WITHOUT_LEDGER',
          message: 'Payment event has no matching ledger deposit',
          entityType: 'paymentEvent',
          entityId: event.id,
          details: { providerEventId: event.providerEventId, txHash },
        });
      } else if (ledgerMatch.amountMinor !== event.amountMinor) {
        issues.push({
          code: 'DEPOSIT_AMOUNT_MISMATCH',
          message: 'Payment event amount does not match ledger deposit',
          entityType: 'paymentEvent',
          entityId: event.id,
          details: {
            providerEventId: event.providerEventId,
            eventAmountMinor: event.amountMinor.toString(),
            ledgerAmountMinor: ledgerMatch.amountMinor.toString(),
          },
        });
      }
    }

    return issues;
  }

  private async reconcileUserDeposits(): Promise<PaymentReconciliationIssue[]> {
    const issues: PaymentReconciliationIssue[] = [];
    const users = await this.prisma.userCryptoDeposit.findMany({
      select: { userId: true },
    });

    for (const { userId } of users) {
      const gatewayPayments =
        await this.paymentProvider.listUserPayments(userId);
      const gatewayCreditedMinor = gatewayPayments
        .filter((payment) => payment.status === 'credited')
        .reduce(
          (sum, payment) => sum + sunToUsdMinor(BigInt(payment.amountSun)),
          0n,
        );

      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        continue;
      }

      const ledgerRows = await this.prisma.ledgerEntry.findMany({
        where: {
          walletId: wallet.id,
          type: LedgerEntryType.DEPOSIT,
        },
      });

      const ledgerCryptoMinor = ledgerRows
        .filter((entry) => {
          const metadata = entry.metadata as Record<string, unknown> | null;
          return metadata?.source === 'crypto_tron';
        })
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);

      if (gatewayCreditedMinor !== ledgerCryptoMinor) {
        issues.push({
          code: 'GATEWAY_LEDGER_DEPOSIT_MISMATCH',
          message:
            'Gateway credited deposits do not match ledger crypto deposits',
          entityType: 'user',
          entityId: userId,
          details: {
            gatewayCreditedMinor: gatewayCreditedMinor.toString(),
            ledgerCryptoMinor: ledgerCryptoMinor.toString(),
          },
        });
      }
    }

    return issues;
  }

  private async reconcileUserWithdrawals(): Promise<
    PaymentReconciliationIssue[]
  > {
    const issues: PaymentReconciliationIssue[] = [];
    const paidWithdrawals = await this.prisma.withdrawalRequest.findMany({
      where: { status: 'PAID' },
      take: 500,
    });

    const userIds = [...new Set(paidWithdrawals.map((row) => row.userId))];

    for (const userId of userIds) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        continue;
      }

      const ledgerWithdrawMinor = await this.sumLedgerWithdrawals(wallet.id);
      const requestPaidMinor = paidWithdrawals
        .filter((row) => row.userId === userId)
        .reduce((sum, row) => sum + row.amountMinor, 0n);

      if (ledgerWithdrawMinor !== requestPaidMinor) {
        issues.push({
          code: 'GATEWAY_LEDGER_WITHDRAW_MISMATCH',
          message:
            'Paid withdrawal requests do not match ledger withdraw entries',
          entityType: 'user',
          entityId: userId,
          details: {
            requestPaidMinor: requestPaidMinor.toString(),
            ledgerWithdrawMinor: ledgerWithdrawMinor.toString(),
          },
        });
      }
    }

    return issues;
  }

  private async sumLedgerWithdrawals(walletId: string): Promise<bigint> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        walletId,
        type: { in: [LedgerEntryType.WITHDRAW, LedgerEntryType.WITHDRAW_FEE] },
      },
    });

    return entries.reduce(
      (sum, entry) =>
        sum + (entry.amountMinor < 0n ? -entry.amountMinor : entry.amountMinor),
      0n,
    );
  }

  private readTxHash(payload: Prisma.JsonValue): string | null {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'txHash' in payload &&
      typeof payload.txHash === 'string'
    ) {
      return payload.txHash;
    }
    return null;
  }
}
