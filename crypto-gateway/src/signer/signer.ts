import { TronWeb } from 'tronweb';
import { prisma } from '../db/client.js';
import { deriveTronPrivateKeyFromMnemonic } from '../shared/bip44.js';
import { loadSignerConfig } from '../shared/config.js';
import {
  emitWithdrawalFailed,
  emitWithdrawalPaid,
} from '../webhook/emitter.js';

const USDT_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
];

async function processWithdrawal(params: {
  withdrawalId: string;
  tronWeb: TronWeb;
  hotWalletAddress: string;
  usdtContract: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<void> {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: params.withdrawalId },
    include: { user: true },
  });
  if (!withdrawal || withdrawal.status !== 'pending') {
    return;
  }

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status: 'processing' },
  });

  try {
    const contract = await params.tronWeb.contract(USDT_ABI, params.usdtContract);
    const txId = await contract
      .transfer(withdrawal.toAddress, withdrawal.amountSun.toString())
      .send();

    const eventId = await emitWithdrawalPaid({
      withdrawalId: withdrawal.id,
      externalUserId: withdrawal.user.externalUserId,
      payoutTxHash: String(txId),
      amountSun: withdrawal.amountSun,
      feeSun: withdrawal.feeSun,
      webhookUrl: params.webhookUrl,
      webhookSecret: params.webhookSecret,
    });

    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: 'paid',
        payoutTxHash: String(txId),
        webhookEventId: eventId,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'PAYOUT_FAILED';

    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          failReason: reason,
        },
      });

      await tx.gatewayUser.update({
        where: { id: withdrawal.userId },
        data: {
          balanceSun: {
            increment: withdrawal.amountSun + withdrawal.feeSun,
          },
        },
      });
    });

    await emitWithdrawalFailed({
      withdrawalId: withdrawal.id,
      externalUserId: withdrawal.user.externalUserId,
      reason,
      webhookUrl: params.webhookUrl,
      webhookSecret: params.webhookSecret,
    });
  }
}

async function runSignerTick(): Promise<void> {
  const config = loadSignerConfig();
  const webhookUrl = process.env.WEBHOOK_URL ?? '';
  const webhookSecret = process.env.WEBHOOK_SECRET ?? '';

  const tronWeb = new TronWeb({
    fullHost: process.env.TRON_GRID_BASE_URL ?? 'https://api.trongrid.io',
    headers: config.tronGridApiKey
      ? { 'TRON-PRO-API-KEY': config.tronGridApiKey }
      : undefined,
  });

  // Hot wallet signs payouts (index 0 path account or dedicated hot key from env).
  const hotPrivateKey = deriveTronPrivateKeyFromMnemonic(config.mnemonic, 0);
  tronWeb.setPrivateKey(hotPrivateKey);

  const pending = await prisma.withdrawal.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const withdrawal of pending) {
    if (withdrawal.amountSun > config.maxWithdrawalSun) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          failReason: 'AMOUNT_EXCEEDS_LIMIT',
        },
      });
      continue;
    }

    await processWithdrawal({
      withdrawalId: withdrawal.id,
      tronWeb,
      hotWalletAddress: config.hotWalletAddress,
      usdtContract: config.usdtContract,
      webhookUrl,
      webhookSecret,
    });
  }
}

const INTERVAL_MS = Number(process.env.SIGNER_INTERVAL_MS ?? 10_000);

void runSignerTick().catch((error) => {
  console.error(error);
});

setInterval(() => {
  void runSignerTick().catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'signer tick failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}, INTERVAL_MS);
