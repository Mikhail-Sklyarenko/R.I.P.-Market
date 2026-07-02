import { prisma } from '../db/client.js';
import { nextPaymentStatus } from '../shared/payment-state.js';
import type { GatewayConfig } from '../shared/config.js';
import { emitDepositCredited } from '../webhook/emitter.js';
import type { TronGridClient } from './trongrid.js';

const SCANNER_LOCK_KEY = 915_001;

async function withScannerLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${SCANNER_LOCK_KEY}) AS locked
  `;
  if (!rows[0]?.locked) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SCANNER_LOCK_KEY})`;
  }
}

async function getCheckpoint(): Promise<bigint> {
  const state = await prisma.scannerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: 0n },
    update: {},
  });
  return state.lastBlock;
}

async function setCheckpoint(lastBlock: bigint): Promise<void> {
  await prisma.scannerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock },
    update: { lastBlock },
  });
}

async function creditPayment(
  paymentId: string,
  config: Pick<GatewayConfig, 'webhookUrl' | 'webhookSecret'>,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true },
  });
  if (!payment || payment.status !== 'held') {
    return;
  }

  const creditedAt = new Date();
  const eventId = await emitDepositCredited({
    externalUserId: payment.user.externalUserId,
    txHash: payment.txHash,
    amountSun: payment.amountSun,
    address: payment.address,
    creditedAt,
    webhookUrl: config.webhookUrl,
    webhookSecret: config.webhookSecret,
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'credited',
        creditedAt,
        webhookEventId: eventId,
      },
    });

    await tx.gatewayUser.update({
      where: { id: payment.userId },
      data: { balanceSun: { increment: payment.amountSun } },
    });
  });
}

export async function processDetectedTransfers(params: {
  transfers: Array<{
    txHash: string;
    toAddress: string;
    amountSun: bigint;
    blockNumber: bigint;
    confirmations: number;
  }>;
  config: Pick<
    GatewayConfig,
    'minConfirmations' | 'minDepositSun' | 'webhookUrl' | 'webhookSecret'
  >;
}): Promise<number> {
  let processed = 0;

  for (const transfer of params.transfers) {
    const user = await prisma.gatewayUser.findUnique({
      where: { address: transfer.toAddress },
    });
    if (!user) {
      continue;
    }

    if (transfer.amountSun < params.config.minDepositSun) {
      continue;
    }

    const existing = await prisma.payment.findUnique({
      where: { txHash: transfer.txHash },
    });
    if (existing) {
      continue;
    }

    await prisma.payment.create({
      data: {
        txHash: transfer.txHash,
        userId: user.id,
        address: transfer.toAddress,
        amountSun: transfer.amountSun,
        confirmations: transfer.confirmations,
        status: 'detected',
        blockNumber: transfer.blockNumber,
      },
    });
    processed += 1;
  }

  return processed;
}

export async function advancePaymentConfirmations(params: {
  config: Pick<
    GatewayConfig,
    'minConfirmations' | 'webhookUrl' | 'webhookSecret'
  >;
  tronGrid: TronGridClient;
}): Promise<number> {
  const latestBlock = await params.tronGrid.getLatestBlock();
  const pending = await prisma.payment.findMany({
    where: { status: { in: ['detected', 'held'] } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  let advanced = 0;
  for (const payment of pending) {
    const confirmations = await params.tronGrid.getTransactionConfirmations(
      payment.txHash,
      latestBlock,
    );

    if (confirmations !== payment.confirmations) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { confirmations },
      });
    }

    const next = nextPaymentStatus(
      payment.status,
      confirmations,
      params.config.minConfirmations,
    );
    if (!next) {
      continue;
    }

    if (next === 'held') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'held' },
      });
      advanced += 1;
      await creditPayment(payment.id, params.config);
      continue;
    }
  }

  return advanced;
}

export async function runScannerTick(params: {
  config: Pick<
    GatewayConfig,
    | 'usdtContract'
    | 'minConfirmations'
    | 'minDepositSun'
    | 'webhookUrl'
    | 'webhookSecret'
  >;
  tronGrid: TronGridClient;
}): Promise<{ scannedBlocks: bigint; detected: number; advanced: number }> {
  return (
    (await withScannerLock(async () => {
      const latestBlock = await params.tronGrid.getLatestBlock();
      const checkpoint = await getCheckpoint();
      const fromBlock = checkpoint > 0n ? checkpoint + 1n : latestBlock - 20n;

      if (fromBlock > latestBlock) {
        const advanced = await advancePaymentConfirmations({
          config: params.config,
          tronGrid: params.tronGrid,
        });
        return { scannedBlocks: 0n, detected: 0, advanced };
      }

      const addresses = await prisma.gatewayUser.findMany({
        select: { address: true },
      });

      let detected = 0;
      for (const { address } of addresses) {
        const transfers = await params.tronGrid.getTrc20Transfers({
          contractAddress: params.config.usdtContract,
          minBlock: fromBlock,
          maxBlock: latestBlock,
          toAddress: address,
        });

        detected += await processDetectedTransfers({
          transfers,
          config: params.config,
        });
      }

      await setCheckpoint(latestBlock);
      const advanced = await advancePaymentConfirmations({
        config: params.config,
        tronGrid: params.tronGrid,
      });

      return {
        scannedBlocks: latestBlock - fromBlock + 1n,
        detected,
        advanced,
      };
    })) ?? { scannedBlocks: 0n, detected: 0, advanced: 0 }
  );
}
