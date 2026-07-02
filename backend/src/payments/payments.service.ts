import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentIntentStatus,
  Prisma,
  WithdrawalRequestStatus,
} from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentProvider, PaymentWebhookPayload } from '../providers/payment/payment-provider.interface';
import { getPaymentConfig, isCryptoPaymentProvider } from '../providers/payment/payment.config';
import {
  isValidTronAddress,
  sunToUsdMinor,
  usdMinorToSun,
} from '../providers/payment/payment.util';
import { PAYMENT_PROVIDER } from '../providers/tokens';
import { LedgerService } from '../wallet/ledger.service';
import { WithdrawalGuardService } from './withdrawal-guard.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly withdrawalGuard: WithdrawalGuardService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async getDepositInfo(userId: string) {
    if (!isCryptoPaymentProvider()) {
      throw new ForbiddenException('Crypto payments are not enabled');
    }

    const config = getPaymentConfig();
    let deposit = await this.prisma.userCryptoDeposit.findUnique({
      where: { userId },
    });

    if (!deposit) {
      const gatewayUser = await this.paymentProvider.ensureDepositAddress(userId);
      deposit = await this.prisma.userCryptoDeposit.create({
        data: {
          userId,
          depositAddress: gatewayUser.address,
          walletIndex: gatewayUser.walletIndex,
        },
      });

      await this.prisma.paymentIntent.create({
        data: {
          userId,
          provider: 'crypto_tron',
          status: PaymentIntentStatus.PENDING,
          depositAddress: gatewayUser.address,
          idempotencyKey: `deposit-intent:${userId}`,
        },
      });
    }

    return toJsonSafe({
      address: deposit.depositAddress,
      network: 'TRON',
      token: 'USDT TRC-20',
      minDepositMinor: config.minDepositMinor,
      qrData: `tron:${deposit.depositAddress}`,
      walletIndex: deposit.walletIndex,
    });
  }

  async getDepositStatus(userId: string) {
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: PaymentIntentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const events = await this.prisma.paymentEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return toJsonSafe({ intents, events });
  }

  async createWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountMinor: number;
    idempotencyKey: string;
  }) {
    if (!isCryptoPaymentProvider()) {
      throw new ForbiddenException('Crypto payments are not enabled');
    }

    const config = getPaymentConfig();
    if (params.amountMinor < config.minWithdrawMinor) {
      throw new BadRequestException(
        `Minimum withdrawal is ${config.minWithdrawMinor} minor units`,
      );
    }

    if (!isValidTronAddress(params.toAddress)) {
      throw new BadRequestException('Invalid TRC-20 address');
    }

    const existing = await this.prisma.withdrawalRequest.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return toJsonSafe(existing);
    }

    const feeMinor = BigInt(config.withdrawFeeMinor);
    const amountMinor = BigInt(params.amountMinor);
    if (amountMinor <= feeMinor) {
      throw new BadRequestException('Withdrawal amount must exceed fee');
    }
    const netMinor = amountMinor - feeMinor;

    const available = await this.ledgerService.getAvailableBalance(params.userId);
    if (available < amountMinor) {
      throw new BadRequestException('Insufficient available balance');
    }

    const { needsManualReview } = await this.withdrawalGuard.validateAndResolveReview(
      params.userId,
      amountMinor,
    );

    const initialStatus = needsManualReview
      ? WithdrawalRequestStatus.PENDING_REVIEW
      : WithdrawalRequestStatus.APPROVED;

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      if (needsManualReview) {
        await this.ledgerService.freezeForWithdrawal({
          userId: params.userId,
          amountMinor,
          tx,
        });
      }

      return tx.withdrawalRequest.create({
        data: {
          userId: params.userId,
          toAddress: params.toAddress,
          amountMinor,
          feeMinor,
          netMinor,
          status: initialStatus,
          idempotencyKey: params.idempotencyKey,
        },
      });
    });

    if (!needsManualReview) {
      return this.approveWithdrawal(withdrawal.id, params.userId, true);
    }

    return toJsonSafe(withdrawal);
  }

  async listWithdrawals(userId: string) {
    const items = await this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return toJsonSafe(items);
  }

  async getWithdrawal(userId: string, withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { id: withdrawalId, userId },
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }
    return toJsonSafe(withdrawal);
  }

  async listPendingWithdrawals() {
    const items = await this.prisma.withdrawalRequest.findMany({
      where: { status: WithdrawalRequestStatus.PENDING_REVIEW },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return toJsonSafe(items);
  }

  async approveWithdrawal(
    withdrawalId: string,
    reviewerId: string,
    auto = false,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (
      withdrawal.status !== WithdrawalRequestStatus.PENDING_REVIEW &&
      withdrawal.status !== WithdrawalRequestStatus.APPROVED
    ) {
      return toJsonSafe(withdrawal);
    }

    const config = getPaymentConfig();
    const fromFrozen =
      config.withdrawManualReview &&
      withdrawal.status === WithdrawalRequestStatus.PENDING_REVIEW;

    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.withdraw({
        userId: withdrawal.userId,
        amountMinor: withdrawal.amountMinor,
        feeMinor: withdrawal.feeMinor,
        netMinor: withdrawal.netMinor,
        idempotencyKey: `withdraw:${withdrawal.id}`,
        withdrawalRequestId: withdrawal.id,
        fromFrozen,
        metadata: {
          source: 'crypto_tron',
          toAddress: withdrawal.toAddress,
        },
        tx,
      });

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: WithdrawalRequestStatus.PROCESSING,
          reviewedBy: auto ? null : reviewerId,
        },
      });
    });

    try {
      const gatewayWithdrawal = await this.paymentProvider.createGatewayWithdrawal({
        userId: withdrawal.userId,
        toAddress: withdrawal.toAddress,
        amountSun: usdMinorToSun(withdrawal.netMinor).toString(),
      });

      const updated = await this.prisma.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: { gatewayRef: gatewayWithdrawal.id },
      });

      return toJsonSafe(updated);
    } catch (error) {
      await this.failWithdrawalAfterApprove(
        withdrawal,
        error instanceof Error ? error.message : 'Gateway error',
      );
      throw new BadRequestException('Withdrawal gateway request failed');
    }
  }

  async rejectWithdrawal(
    withdrawalId: string,
    reviewerId: string,
    reason: string,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalRequestStatus.PENDING_REVIEW) {
      return toJsonSafe(withdrawal);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.releaseWithdrawHold({
        userId: withdrawal.userId,
        amountMinor: withdrawal.amountMinor,
        tx,
      });

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: WithdrawalRequestStatus.REJECTED,
          reviewedBy: reviewerId,
          rejectReason: reason,
        },
      });
    });

    const updated = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    return toJsonSafe(updated);
  }

  async handleWebhook(rawBody: string, payload: PaymentWebhookPayload) {
    const providerEventId = payload.eventId;
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId },
    });
    if (existing?.processedAt) {
      return { ok: true, duplicate: true };
    }

    try {
      await this.prisma.paymentEvent.create({
        data: {
          provider: 'crypto_tron',
          providerEventId,
          eventType: payload.type,
          userId:
            payload.type === 'deposit.credited'
              ? payload.externalUserId
              : payload.externalUserId,
          amountMinor:
            payload.type === 'deposit.credited'
              ? sunToUsdMinor(BigInt(payload.amountSun))
              : payload.type === 'withdrawal.paid'
                ? sunToUsdMinor(BigInt(payload.amountSun))
                : 0n,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: true, duplicate: true };
      }
      throw error;
    }

    if (payload.type === 'deposit.credited') {
      await this.handleDepositCredited(payload);
    } else if (payload.type === 'withdrawal.paid') {
      await this.handleWithdrawalPaid(payload);
    } else if (payload.type === 'withdrawal.failed') {
      await this.handleWithdrawalFailed(payload);
    }

    await this.prisma.paymentEvent.update({
      where: { providerEventId },
      data: { processedAt: new Date() },
    });

    return { ok: true };
  }

  private async handleDepositCredited(
    payload: Extract<PaymentWebhookPayload, { type: 'deposit.credited' }>,
  ) {
    const amountMinor = sunToUsdMinor(BigInt(payload.amountSun));
    if (amountMinor <= 0n) {
      throw new BadRequestException('Invalid deposit amount');
    }

    const config = getPaymentConfig();
    if (amountMinor < BigInt(config.minDepositMinor)) {
      return;
    }

    const wallet = await this.ledgerService.ensureUserWallet(payload.externalUserId);

    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.deposit({
        userId: payload.externalUserId,
        amountMinor,
        idempotencyKey: `crypto:deposit:${payload.txHash}`,
        metadata: {
          source: 'crypto_tron',
          txHash: payload.txHash,
          gatewayEventId: payload.eventId,
          address: payload.address,
          amountSun: payload.amountSun,
        },
        tx,
      });

      await tx.userCryptoDeposit.updateMany({
        where: { userId: payload.externalUserId },
        data: { depositAddress: payload.address },
      });

      await tx.paymentIntent.updateMany({
        where: {
          userId: payload.externalUserId,
          status: PaymentIntentStatus.PENDING,
        },
        data: {
          status: PaymentIntentStatus.SUCCEEDED,
          providerRef: payload.txHash,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'DEPOSIT_COMPLETED',
          aggregateType: 'wallet',
          aggregateId: wallet.id,
          payload: {
            userId: payload.externalUserId,
            amountMinor: amountMinor.toString(),
            txHash: payload.txHash,
          },
        },
      });
    });
  }

  private async handleWithdrawalPaid(
    payload: Extract<PaymentWebhookPayload, { type: 'withdrawal.paid' }>,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { gatewayRef: payload.withdrawalId },
    });
    if (!withdrawal || withdrawal.status === WithdrawalRequestStatus.PAID) {
      return;
    }

    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: {
        status: WithdrawalRequestStatus.PAID,
        payoutTxHash: payload.payoutTxHash,
        paidAt: new Date(),
      },
    });
  }

  private async handleWithdrawalFailed(
    payload: Extract<PaymentWebhookPayload, { type: 'withdrawal.failed' }>,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { gatewayRef: payload.withdrawalId },
    });
    if (!withdrawal || withdrawal.status === WithdrawalRequestStatus.FAILED) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.refundWithdrawal({
        userId: withdrawal.userId,
        amountMinor: withdrawal.amountMinor,
        idempotencyKey: `withdraw-refund:${withdrawal.id}`,
        reason: payload.reason,
        withdrawalRequestId: withdrawal.id,
        tx,
      });

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: WithdrawalRequestStatus.FAILED,
          rejectReason: payload.reason,
        },
      });
    });
  }

  private async failWithdrawalAfterApprove(
    withdrawal: {
      id: string;
      userId: string;
      amountMinor: bigint;
    },
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.refundWithdrawal({
        userId: withdrawal.userId,
        amountMinor: withdrawal.amountMinor,
        idempotencyKey: `withdraw-refund:${withdrawal.id}`,
        reason,
        withdrawalRequestId: withdrawal.id,
        tx,
      });

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: WithdrawalRequestStatus.FAILED,
          rejectReason: reason,
        },
      });
    });
  }
}
