import { BadRequestException } from '@nestjs/common';
import { WithdrawalRequestStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { WithdrawalGuardService } from './withdrawal-guard.service';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';

describe('PaymentsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createService(overrides?: {
    prisma?: Partial<PrismaService>;
    ledger?: Partial<LedgerService>;
    guard?: Partial<WithdrawalGuardService>;
    provider?: Partial<PaymentProvider>;
  }) {
    const prisma = {
      paymentEvent: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args) => ({ id: 'evt-1', ...args.data })),
        update: jest.fn(async () => ({})),
      },
      userCryptoDeposit: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args) => args.data),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      paymentIntent: {
        create: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      withdrawalRequest: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args) => ({ id: 'wdr-1', ...args.data })),
        findFirst: jest.fn(async () => null),
        update: jest.fn(async (args) => ({ id: args.where.id, status: args.data.status })),
      },
      outboxEvent: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (fn) => fn(prisma)),
      ...overrides?.prisma,
    };

    const ledger = {
      ensureUserWallet: jest.fn(async () => ({ id: 'wallet-1' })),
      getAvailableBalance: jest.fn(async () => 10_000n),
      deposit: jest.fn(async () => ({ referenceGroupId: 'grp', entries: [] })),
      freezeForWithdrawal: jest.fn(async () => undefined),
      releaseWithdrawHold: jest.fn(async () => undefined),
      withdraw: jest.fn(async () => ({ referenceGroupId: 'grp', entries: [] })),
      refundWithdrawal: jest.fn(async () => ({ referenceGroupId: 'grp', entries: [] })),
      ...overrides?.ledger,
    };

    const guard = {
      validateAndResolveReview: jest.fn(async () => ({
        needsManualReview: true,
        priorWithdrawalCount: 0,
      })),
      ...overrides?.guard,
    };

    const provider = {
      name: 'crypto_tron',
      ensureDepositAddress: jest.fn(async () => ({
        address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        walletIndex: 1,
      })),
      createGatewayWithdrawal: jest.fn(async () => ({
        id: 'gw-1',
        toAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        amountSun: '1000000',
        feeSun: '0',
        status: 'pending',
        payoutTxHash: null,
        failReason: null,
      })),
      getGatewayWithdrawal: jest.fn(async () => null),
      listUserPayments: jest.fn(async () => []),
      verifyWebhookSignature: jest.fn(() => true),
      ...overrides?.provider,
    };

    return {
      service: new PaymentsService(
        prisma as unknown as PrismaService,
        ledger as unknown as LedgerService,
        guard as unknown as WithdrawalGuardService,
        provider as PaymentProvider,
      ),
      prisma,
      ledger,
      provider,
    };
  }

  beforeEach(() => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    process.env.MIN_WITHDRAW_MINOR = '2000';
    process.env.WITHDRAW_FEE_MINOR = '200';
    process.env.WITHDRAW_MANUAL_REVIEW = 'true';
    process.env.MIN_DEPOSIT_MINOR = '500';
  });

  it('rejects withdrawal when balance is insufficient', async () => {
    const { service } = createService({
      ledger: { getAvailableBalance: jest.fn(async () => 100n) },
    });

    await expect(
      service.createWithdrawal({
        userId: 'user-1',
        toAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        amountMinor: 3000,
        idempotencyKey: 'wdr-key-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('handles duplicate deposit webhook idempotently', async () => {
    const { service, prisma, ledger } = createService({
      prisma: {
        paymentEvent: {
          findUnique: jest.fn(async () => ({
            id: 'evt-1',
            providerEventId: 'dep-evt-1',
            processedAt: new Date(),
          })),
          create: jest.fn(),
          update: jest.fn(),
        },
      },
    });

    const result = await service.handleWebhook(
      '{}',
      {
        eventId: 'dep-evt-1',
        type: 'deposit.credited',
        externalUserId: 'user-1',
        txHash: 'tx-duplicate',
        amountSun: '1000000',
        address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        creditedAt: new Date().toISOString(),
      },
    );

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(ledger.deposit).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  it('releases frozen funds on reject', async () => {
    const { service, ledger, prisma } = createService({
      prisma: {
        withdrawalRequest: {
          findUnique: jest.fn(async () => ({
            id: 'wdr-1',
            userId: 'user-1',
            amountMinor: 3000n,
            feeMinor: 200n,
            netMinor: 2800n,
            status: WithdrawalRequestStatus.PENDING_REVIEW,
            toAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
            idempotencyKey: 'wdr-key-1',
          })),
          update: jest.fn(async (args) => args.data),
        },
      },
    });

    await service.rejectWithdrawal('wdr-1', 'admin-1', 'manual reject');

    expect(ledger.releaseWithdrawHold).toHaveBeenCalledWith({
      userId: 'user-1',
      amountMinor: 3000n,
      tx: prisma,
    });
  });

  it('credits ledger on deposit webhook', async () => {
    const { service, ledger } = createService();

    await service.handleWebhook('{}', {
      eventId: 'dep-evt-2',
      type: 'deposit.credited',
      externalUserId: 'user-1',
      txHash: 'tx-abc',
      amountSun: '5000000',
      address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      creditedAt: new Date().toISOString(),
    });

    expect(ledger.deposit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountMinor: 500n,
        idempotencyKey: 'crypto:deposit:tx-abc',
      }),
    );
  });
});
