import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';
import {
  isCryptoPaymentProvider,
  isLivePaymentProvider,
  isNorthPaymentProvider,
} from '../providers/payment/payment.config';
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

    if (!isLivePaymentProvider()) {
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

    if (!isLivePaymentProvider()) {
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        issueCount: 0,
        issues: [],
      };
    }

    issues.push(...(await this.reconcileDepositEvents()));
    if (isCryptoPaymentProvider())
      issues.push(...(await this.reconcileUserDeposits()));
    if (isNorthPaymentProvider())
      issues.push({
        code: 'PROVIDER_DEPOSIT_RECONCILIATION_UNAVAILABLE',
        message:
          'NORTH remote deposit history is not available through this adapter; local events are checked but provider completeness is unverified',
        entityType: 'provider',
        entityId: 'north',
      });
    issues.push(...(await this.reconcileProviderWithdrawals()));
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
    });

    const ledgerDeposits = await this.prisma.ledgerEntry.findMany({
      where: { type: LedgerEntryType.DEPOSIT },
      orderBy: { createdAt: 'desc' },
    });

    for (const event of depositEvents) {
      const txHash = this.readTxHash(event.payload);
      const ledgerMatch = ledgerDeposits.find((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        return (
          metadata?.source === event.provider &&
          (txHash
            ? metadata?.txHash === txHash
            : metadata?.gatewayEventId === event.providerEventId)
        );
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
    const requests = await this.prisma.withdrawalRequest.findMany({
      where: { status: { in: ['PAID', 'PROCESSING', 'FAILED'] } },
    });
    for (const row of requests) {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: row.userId },
      });
      const entries = wallet
        ? await this.prisma.ledgerEntry.findMany({
            where: {
              walletId: wallet.id,
              idempotencyKey: {
                in: [
                  `withdraw:${row.id}`,
                  `withdraw:${row.id}:fee`,
                  `withdraw-refund:${row.id}`,
                ],
              },
            },
          })
        : [];
      const debit = entries
        .filter((e) => e.type === 'WITHDRAW' || e.type === 'WITHDRAW_FEE')
        .reduce((sum, e) => sum - e.amountMinor, 0n);
      const refund = entries
        .filter((e) => e.idempotencyKey === `withdraw-refund:${row.id}`)
        .reduce((sum, e) => sum + e.amountMinor, 0n);
      const expected = row.status === 'FAILED' ? 0n : row.amountMinor;
      if (debit - refund !== expected)
        issues.push({
          code: 'WITHDRAWAL_LEDGER_MISMATCH',
          message: 'Withdrawal net debit differs from its state',
          entityType: 'withdrawal',
          entityId: row.id,
          details: {
            expected: expected.toString(),
            actual: (debit - refund).toString(),
          },
        });
    }
    return issues;
  }

  private async reconcileProviderWithdrawals(): Promise<
    PaymentReconciliationIssue[]
  > {
    const issues: PaymentReconciliationIssue[] = [];
    const requests = await this.prisma.withdrawalRequest.findMany({
      where: { status: { in: ['PROCESSING', 'PAID', 'FAILED'] } },
    });
    for (const row of requests) {
      try {
        const remote = await this.paymentProvider.getGatewayWithdrawal(
          row.gatewayRef ?? `wd_${row.id}`,
        );
        if (
          !remote ||
          remote.status.toUpperCase() !== row.status ||
          remote.toAddress !== row.toAddress ||
          BigInt(remote.amountSun) !== row.netMinor * 10_000n
        )
          issues.push({
            code: 'PROVIDER_WITHDRAWAL_UNRECONCILED',
            message: 'Withdrawal provider result needs reconciliation',
            entityType: 'withdrawal',
            entityId: row.id,
            details: { local: row.status, remote: remote?.status ?? 'unknown' },
          });
      } catch {
        issues.push({
          code: 'PROVIDER_WITHDRAWAL_UNAVAILABLE',
          message: 'Unable to query provider withdrawal',
          entityType: 'withdrawal',
          entityId: row.id,
        });
      }
    }
    return issues;
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
