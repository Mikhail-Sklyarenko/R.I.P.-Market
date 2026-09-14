import type { GatewayUser, Payment, Withdrawal } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  deriveTronAddressFromMnemonic,
  deriveTronAddressFromXpub,
} from '../shared/bip44.js';
import type { GatewayConfig } from '../shared/config.js';

export type UserResponse = {
  externalUserId: string;
  address: string;
  walletIndex: number;
  balanceSun: string;
  createdAt: string;
};

export type PaymentResponse = {
  txHash: string;
  amountSun: string;
  confirmations: number;
  status: string;
  address: string;
  creditedAt: string | null;
  createdAt: string;
};

export type WithdrawalResponse = {
  id: string;
  toAddress: string;
  amountSun: string;
  feeSun: string;
  status: string;
  payoutTxHash: string | null;
  failReason: string | null;
  createdAt: string;
  updatedAt: string;
};

function toUserResponse(user: GatewayUser): UserResponse {
  return {
    externalUserId: user.externalUserId,
    address: user.address,
    walletIndex: user.walletIndex,
    balanceSun: user.balanceSun.toString(),
    createdAt: user.createdAt.toISOString(),
  };
}

function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    txHash: payment.txHash,
    amountSun: payment.amountSun.toString(),
    confirmations: payment.confirmations,
    status: payment.status,
    address: payment.address,
    creditedAt: payment.creditedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toWithdrawalResponse(withdrawal: Withdrawal): WithdrawalResponse {
  return {
    id: withdrawal.id,
    toAddress: withdrawal.toAddress,
    amountSun: withdrawal.amountSun.toString(),
    feeSun: withdrawal.feeSun.toString(),
    status: withdrawal.status,
    payoutTxHash: withdrawal.payoutTxHash,
    failReason: withdrawal.failReason,
    createdAt: withdrawal.createdAt.toISOString(),
    updatedAt: withdrawal.updatedAt.toISOString(),
  };
}

function deriveAddress(
  walletIndex: number,
  config: Pick<GatewayConfig, 'mnemonic' | 'xpub'>,
): string {
  if (config.mnemonic) {
    return deriveTronAddressFromMnemonic(config.mnemonic, walletIndex);
  }
  if (config.xpub) {
    return deriveTronAddressFromXpub(config.xpub, walletIndex);
  }
  throw new Error('MNEMONIC or XPUB required to derive deposit addresses');
}

async function allocateWalletIndex(
  config: Pick<GatewayConfig, 'mnemonic' | 'xpub'>,
): Promise<{ walletIndex: number; address: string }> {
  return prisma.$transaction(async (tx) => {
    const counter = await tx.walletCounter.upsert({
      where: { id: 1 },
      create: { id: 1, next: 1 },
      update: {},
    });

    const allocated = await tx.walletCounter.update({
      where: { id: 1 },
      data: { next: { increment: 1 } },
    });
    const walletIndex = allocated.next - 1;
    if (walletIndex < 1) throw new Error('DEPOSIT_INDEX_RESERVED');
    const address = deriveAddress(walletIndex, config);

    await tx.walletRegistry.create({
      data: { walletIndex, address },
    });

    return { walletIndex, address };
  });
}

export async function ensureGatewayUser(
  externalUserId: string,
  config: Pick<GatewayConfig, 'mnemonic' | 'xpub'>,
): Promise<UserResponse> {
  const existing = await prisma.gatewayUser.findUnique({
    where: { externalUserId },
  });
  if (existing) {
    if (existing.walletIndex === 0)
      throw new Error('LEGACY_HOT_WALLET_ADDRESS_REQUIRES_MIGRATION');
    return toUserResponse(existing);
  }

  const { walletIndex, address } = await allocateWalletIndex(config);

  const user = await prisma.gatewayUser.create({
    data: {
      externalUserId,
      walletIndex,
      address,
    },
  });

  return toUserResponse(user);
}

export async function getGatewayUser(
  externalUserId: string,
): Promise<UserResponse | null> {
  const user = await prisma.gatewayUser.findUnique({
    where: { externalUserId },
  });
  if (user?.walletIndex === 0)
    throw new Error('LEGACY_HOT_WALLET_ADDRESS_REQUIRES_MIGRATION');
  return user ? toUserResponse(user) : null;
}

export async function getUserBalance(
  externalUserId: string,
): Promise<{ balanceSun: string } | null> {
  const user = await prisma.gatewayUser.findUnique({
    where: { externalUserId },
    select: { balanceSun: true },
  });
  if (!user) {
    return null;
  }
  return { balanceSun: user.balanceSun.toString() };
}

export async function listUserPayments(
  externalUserId: string,
): Promise<PaymentResponse[]> {
  const user = await prisma.gatewayUser.findUnique({
    where: { externalUserId },
  });
  if (!user) {
    return [];
  }

  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return payments.map(toPaymentResponse);
}

export async function createWithdrawal(params: {
  externalUserId: string;
  toAddress: string;
  amountSun: bigint;
  feeSun: bigint;
  externalId: string;
  debitSource?: 'gateway_balance' | 'backend_authorized';
}): Promise<WithdrawalResponse> {
  const user = await prisma.gatewayUser.findUnique({
    where: { externalUserId: params.externalUserId },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const existing = await prisma.withdrawal.findUnique({
    where: { externalId: params.externalId },
  });
  if (existing) {
    if (
      existing.userId !== user.id ||
      existing.toAddress !== params.toAddress ||
      existing.amountSun !== params.amountSun ||
      existing.feeSun !== params.feeSun ||
      existing.debitSource !== (params.debitSource ?? 'gateway_balance')
    )
      throw new Error('IDEMPOTENCY_CONFLICT');
    return toWithdrawalResponse(existing);
  }
  if (params.amountSun <= 0n || params.feeSun < 0n)
    throw new Error('INVALID_AMOUNT');
  const totalDebit = params.amountSun + params.feeSun;
  if (
    params.debitSource !== 'backend_authorized' &&
    user.balanceSun < totalDebit
  ) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  const withdrawal = await prisma.$transaction(async (tx) => {
    if (params.debitSource !== 'backend_authorized') {
      const updated = await tx.gatewayUser.updateMany({
        where: {
          id: user.id,
          balanceSun: { gte: totalDebit },
        },
        data: {
          balanceSun: { decrement: totalDebit },
        },
      });

      if (updated.count !== 1) {
        throw new Error('INSUFFICIENT_BALANCE');
      }
    }
    return tx.withdrawal.create({
      data: {
        userId: user.id,
        externalId: params.externalId,
        debitSource: params.debitSource ?? 'gateway_balance',
        toAddress: params.toAddress,
        amountSun: params.amountSun,
        feeSun: params.feeSun,
        status: 'pending',
      },
    });
  });

  return toWithdrawalResponse(withdrawal);
}

export async function getWithdrawal(
  id: string,
): Promise<WithdrawalResponse | null> {
  const withdrawal = await prisma.withdrawal.findFirst({
    where: { OR: [{ id }, { externalId: id }] },
  });
  return withdrawal ? toWithdrawalResponse(withdrawal) : null;
}

export { toUserResponse, toPaymentResponse, toWithdrawalResponse };
