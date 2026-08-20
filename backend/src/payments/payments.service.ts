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
import { randomUUID } from 'node:crypto';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PaymentProvider,
  PaymentWebhookPayload,
} from '../providers/payment/payment-provider.interface';
import {
  getPaymentConfig,
  getNorthPaymentMethods,
  isCryptoPaymentProvider,
  isLivePaymentProvider,
  isNorthPaymentProvider,
} from '../providers/payment/payment.config';
import { NorthGatewayError } from '../providers/payment/north/north.types';
import {
  isNorthPaymentMethod,
  type NorthPaymentMethod,
} from '../providers/payment/north/north.types';
import {
  isValidTronAddress,
  sunToUsdMinor,
  usdDecimalToMinor,
  usdMinorToDecimalString,
  usdMinorToSun,
} from '../providers/payment/payment.util';
import { PAYMENT_PROVIDER } from '../providers/tokens';
import { LedgerService } from '../wallet/ledger.service';
import { WithdrawalGuardService } from './withdrawal-guard.service';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

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
    if (!isLivePaymentProvider()) {
      throw new ForbiddenException('Crypto payments are not enabled');
    }

    const config = getPaymentConfig();

    if (isNorthPaymentProvider()) {
      return toJsonSafe({
        mode: 'checkout' as const,
        paymentMethods: getNorthPaymentMethods(),
        minDepositMinor: config.minDepositMinor,
        token: 'USDT',
        network: 'MULTI',
      });
    }

    let deposit = await this.prisma.userCryptoDeposit.findUnique({
      where: { userId },
    });

    if (!deposit) {
      const gatewayUser =
        await this.paymentProvider.ensureDepositAddress(userId);
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
      mode: 'address' as const,
      address: deposit.depositAddress,
      network: 'TRON',
      token: 'USDT TRC-20',
      paymentMethods: ['trc20'],
      minDepositMinor: config.minDepositMinor,
      qrData: `tron:${deposit.depositAddress}`,
      walletIndex: deposit.walletIndex,
    });
  }

  async createDepositCheckout(params: {
    userId: string;
    amountMinor: number;
    paymentMethod: NorthPaymentMethod;
    returnUrl?: string;
  }) {
    if (!isNorthPaymentProvider()) {
      throw new ForbiddenException('Checkout deposits require NORTH provider');
    }
    if (!this.paymentProvider.createCheckout) {
      throw new ForbiddenException('Payment provider does not support checkout');
    }

    const config = getPaymentConfig();
    if (params.amountMinor < config.minDepositMinor) {
      throw new BadRequestException(
        `Minimum deposit is ${config.minDepositMinor} minor units`,
      );
    }
    if (!isNorthPaymentMethod(params.paymentMethod)) {
      throw new BadRequestException(
        'paymentMethod must be trc20, bep20, or erc20',
      );
    }

    const externalId = `dep_${randomUUID()}`;
    const amountUsd = usdMinorToDecimalString(params.amountMinor);

    await this.prisma.paymentIntent.create({
      data: {
        userId: params.userId,
        provider: 'north',
        amountMinor: BigInt(params.amountMinor),
        status: PaymentIntentStatus.PENDING,
        idempotencyKey: externalId,
        metadata: {
          paymentMethod: params.paymentMethod,
          amountUsd,
          returnUrl: params.returnUrl ?? null,
        },
      },
    });

    try {
      const session = await this.paymentProvider.createCheckout({
        externalId,
        userId: params.userId,
        amountUsd,
        paymentMethod: params.paymentMethod,
        returnUrl: params.returnUrl,
      });

      await this.prisma.paymentIntent.update({
        where: { idempotencyKey: externalId },
        data: {
          providerRef: session.invoiceId,
          depositAddress: session.address ?? undefined,
          metadata: {
            paymentMethod: params.paymentMethod,
            amountUsd,
            returnUrl: params.returnUrl ?? null,
            checkoutUrl: session.checkoutUrl,
            creditUsd: session.creditUsd,
            expiresAt: session.expiresAt,
          },
        },
      });

      return toJsonSafe({
        mode: 'checkout' as const,
        checkoutUrl: session.checkoutUrl,
        invoiceId: session.invoiceId,
        externalId,
        paymentMethod: session.paymentMethod,
        amountMinor: params.amountMinor,
        amountUsd,
        creditUsd: session.creditUsd,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      await this.prisma.paymentIntent.update({
        where: { idempotencyKey: externalId },
        data: { status: PaymentIntentStatus.FAILED },
      });

      if (error instanceof NorthGatewayError) {
        if (error.status === 400) {
          throw new BadRequestException(
            error.message || 'Invalid checkout request',
          );
        }
        throw new BadRequestException(
          `Checkout failed: ${error.message || 'gateway error'}`,
        );
      }
      throw error;
    }
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
    paymentMethod?: NorthPaymentMethod;
  }) {
    if (!isLivePaymentProvider()) {
      throw new ForbiddenException('Crypto payments are not enabled');
    }

    const config = getPaymentConfig();
    if (params.amountMinor < config.minWithdrawMinor) {
      throw new BadRequestException(
        `Minimum withdrawal is ${config.minWithdrawMinor} minor units`,
      );
    }

    const paymentMethod = this.resolveWithdrawalPaymentMethod(
      params.toAddress,
      params.paymentMethod,
    );
    this.assertWithdrawalAddress(params.toAddress, paymentMethod);

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

    const available = await this.ledgerService.getAvailableBalance(
      params.userId,
    );
    if (available < amountMinor) {
      throw new BadRequestException('Insufficient available balance');
    }

    const { needsManualReview } =
      await this.withdrawalGuard.validateAndResolveReview(
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
          paymentMethod,
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

    const providerName = config.provider;

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
          source: providerName,
          toAddress: withdrawal.toAddress,
          paymentMethod: withdrawal.paymentMethod,
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
      const paymentMethod = isNorthPaymentMethod(withdrawal.paymentMethod)
        ? withdrawal.paymentMethod
        : 'trc20';

      const gatewayWithdrawal =
        await this.paymentProvider.createGatewayWithdrawal({
          userId: withdrawal.userId,
          toAddress: withdrawal.toAddress,
          amountSun: usdMinorToSun(withdrawal.netMinor).toString(),
          externalId: `wd_${withdrawal.id}`,
          paymentMethod,
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

    const providerName = getPaymentConfig().provider;
    const amountMinor = this.resolveWebhookAmountMinor(payload);

    try {
      await this.prisma.paymentEvent.create({
        data: {
          provider: providerName === 'mock' ? 'crypto_tron' : providerName,
          providerEventId,
          eventType: payload.type,
          userId: payload.externalUserId,
          amountMinor,
          payload: payload,
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

  private resolveWebhookAmountMinor(payload: PaymentWebhookPayload): bigint {
    if (payload.type === 'deposit.credited') {
      if (payload.creditUsd != null && payload.creditUsd !== '') {
        return usdDecimalToMinor(payload.creditUsd);
      }
      if (payload.amountSun) {
        return sunToUsdMinor(BigInt(payload.amountSun));
      }
      return 0n;
    }
    if (payload.type === 'withdrawal.paid' && payload.amountSun) {
      return sunToUsdMinor(BigInt(payload.amountSun));
    }
    return 0n;
  }

  private async handleDepositCredited(
    payload: Extract<PaymentWebhookPayload, { type: 'deposit.credited' }>,
  ) {
    let amountMinor: bigint;
    try {
      if (payload.creditUsd != null && payload.creditUsd !== '') {
        amountMinor = usdDecimalToMinor(payload.creditUsd);
      } else if (payload.amountSun) {
        amountMinor = sunToUsdMinor(BigInt(payload.amountSun));
      } else {
        throw new BadRequestException('Missing creditUsd/amountSun');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid deposit amount');
    }

    if (amountMinor <= 0n) {
      throw new BadRequestException('Invalid deposit amount');
    }

    const config = getPaymentConfig();
    if (amountMinor < BigInt(config.minDepositMinor)) {
      return;
    }

    const providerName =
      config.provider === 'north' ? 'north' : 'crypto_tron';
    const wallet = await this.ledgerService.ensureUserWallet(
      payload.externalUserId,
    );

    const idempotencyKey = payload.txHash
      ? `${providerName}:deposit:${payload.txHash}`
      : `${providerName}:deposit:event:${payload.eventId}`;

    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.deposit({
        userId: payload.externalUserId,
        amountMinor,
        idempotencyKey,
        metadata: {
          source: providerName,
          txHash: payload.txHash,
          gatewayEventId: payload.eventId,
          address: payload.address,
          amountSun: payload.amountSun,
          creditUsd: payload.creditUsd,
          externalId: payload.externalId,
          invoiceId: payload.invoiceId,
          paymentMethod: payload.paymentMethod,
        },
        tx,
      });

      if (payload.address && isCryptoPaymentProvider()) {
        await tx.userCryptoDeposit.updateMany({
          where: { userId: payload.externalUserId },
          data: { depositAddress: payload.address },
        });
      }

      if (payload.externalId) {
        await tx.paymentIntent.updateMany({
          where: {
            userId: payload.externalUserId,
            idempotencyKey: payload.externalId,
            status: PaymentIntentStatus.PENDING,
          },
          data: {
            status: PaymentIntentStatus.SUCCEEDED,
            providerRef: payload.txHash || payload.invoiceId || payload.eventId,
            depositAddress: payload.address,
          },
        });
      } else {
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
      }

      await tx.outboxEvent.create({
        data: {
          eventType: 'DEPOSIT_COMPLETED',
          aggregateType: 'wallet',
          aggregateId: wallet.id,
          payload: {
            userId: payload.externalUserId,
            amountMinor: amountMinor.toString(),
            txHash: payload.txHash,
            creditUsd: payload.creditUsd ?? null,
            externalId: payload.externalId ?? null,
          },
        },
      });
    });
  }

  private async handleWithdrawalPaid(
    payload: Extract<PaymentWebhookPayload, { type: 'withdrawal.paid' }>,
  ) {
    const withdrawal = await this.findWithdrawalForWebhook(payload);
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
    const withdrawal = await this.findWithdrawalForWebhook(payload);
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

  private async findWithdrawalForWebhook(payload: {
    withdrawalId: string;
    externalId?: string;
  }) {
    if (payload.externalId?.startsWith('wd_')) {
      const byId = await this.prisma.withdrawalRequest.findUnique({
        where: { id: payload.externalId.slice(3) },
      });
      if (byId) {
        return byId;
      }
    }

    return this.prisma.withdrawalRequest.findFirst({
      where: {
        OR: [
          { gatewayRef: payload.withdrawalId },
          ...(payload.externalId
            ? [{ idempotencyKey: payload.externalId }]
            : []),
        ],
      },
    });
  }

  private resolveWithdrawalPaymentMethod(
    toAddress: string,
    requested?: NorthPaymentMethod,
  ): NorthPaymentMethod {
    if (requested) {
      return requested;
    }
    if (isValidTronAddress(toAddress)) {
      return 'trc20';
    }
    if (EVM_ADDRESS_RE.test(toAddress)) {
      throw new BadRequestException(
        'paymentMethod (bep20 or erc20) is required for EVM addresses',
      );
    }
    return 'trc20';
  }

  private assertWithdrawalAddress(
    toAddress: string,
    paymentMethod: NorthPaymentMethod,
  ) {
    if (paymentMethod === 'trc20') {
      if (!isValidTronAddress(toAddress)) {
        throw new BadRequestException('Invalid TRC-20 address');
      }
      return;
    }
    if (!EVM_ADDRESS_RE.test(toAddress)) {
      throw new BadRequestException(
        `Invalid ${paymentMethod.toUpperCase()} address`,
      );
    }
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
