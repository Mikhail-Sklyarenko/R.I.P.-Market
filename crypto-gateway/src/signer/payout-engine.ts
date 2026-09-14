import { TronWeb, type Types } from 'tronweb';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { enqueueWebhook } from '../webhook/emitter.js';

const TRANSFER_TOPIC =
  'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressHex = (address: string) =>
  TronWeb.address.toHex(address).replace(/^41/, '').toLowerCase();

export async function processPayout(
  id: string,
  tron: TronWeb,
  config: {
    hotWalletAddress: string;
    usdtContract: string;
    maxWithdrawalSun: bigint;
    minConfirmations: number;
    webhookUrl: string;
    webhookSecret: string;
  },
): Promise<void> {
  const now = new Date();
  const claim = await prisma.withdrawal.updateMany({
    where: {
      id,
      status: { in: ['pending', 'processing'] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: { leaseUntil: new Date(now.getTime() + 120_000) },
  });
  if (claim.count !== 1) return;
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({
    where: { id },
    include: { user: true },
  });
  const terminal = async (paid: boolean, reason?: string) => {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.withdrawal.updateMany({
        where: { id, status: { in: ['pending', 'processing'] } },
        data: {
          status: paid ? 'paid' : 'failed',
          failReason: reason,
          leaseUntil: null,
        },
      });
      if (changed.count !== 1) return;
      if (!paid && withdrawal.debitSource === 'gateway_balance')
        await tx.gatewayUser.update({
          where: { id: withdrawal.userId },
          data: {
            balanceSun: { increment: withdrawal.amountSun + withdrawal.feeSun },
          },
        });
      const eventId = `${paid ? 'paid' : 'failed'}:${id}`;
      await enqueueWebhook(
        paid
          ? {
              eventId,
              type: 'withdrawal.paid',
              withdrawalId: id,
              externalId: withdrawal.externalId ?? undefined,
              externalUserId: withdrawal.user.externalUserId,
              payoutTxHash: withdrawal.payoutTxHash!,
              amountSun: withdrawal.amountSun.toString(),
              feeSun: withdrawal.feeSun.toString(),
            }
          : {
              eventId,
              type: 'withdrawal.failed',
              withdrawalId: id,
              externalId: withdrawal.externalId ?? undefined,
              externalUserId: withdrawal.user.externalUserId,
              reason: reason!,
            },
        config.webhookUrl,
        config.webhookSecret,
        tx,
      );
    });
  };
  try {
    if (
      withdrawal.status === 'pending' &&
      withdrawal.amountSun > config.maxWithdrawalSun
    ) {
      await terminal(false, 'AMOUNT_EXCEEDS_LIMIT');
      return;
    }
    // Old processing rows without a persisted transaction have an unknown external outcome.
    if (
      withdrawal.failReason === 'LEGACY_UNKNOWN_RESULT' &&
      !withdrawal.payoutTxHash
    )
      return;
    let signed =
      withdrawal.signedTransaction as unknown as Types.SignedTransaction | null;
    if (!signed && !withdrawal.payoutTxHash) {
      const built = await tron.transactionBuilder.triggerSmartContract(
        config.usdtContract,
        'transfer(address,uint256)',
        { feeLimit: 100_000_000 },
        [
          { type: 'address', value: withdrawal.toAddress },
          { type: 'uint256', value: withdrawal.amountSun.toString() },
        ],
        config.hotWalletAddress,
      );
      if (!built.result?.result || !built.transaction)
        throw new Error('Unable to build payout');
      signed = (await tron.trx.sign(
        built.transaction,
      )) as Types.SignedTransaction;
      const persisted = await prisma.withdrawal.updateMany({
        where: { id, payoutTxHash: null, leaseUntil: { gt: new Date() } },
        data: {
          status: 'processing',
          signedTransaction: signed as unknown as Prisma.InputJsonValue,
          payoutTxHash: signed.txID,
        },
      });
      if (persisted.count !== 1) return;
      withdrawal.payoutTxHash = signed.txID;
    }
    // Never construct another transaction after a signed txID has been persisted.
    const hash = withdrawal.payoutTxHash!;
    const info = await tron.trx.getTransactionInfo(hash);
    if (info?.id === hash && info.blockNumber != null) {
      const current = await tron.trx.getCurrentBlock();
      if (
        current.block_header.raw_data.number - info.blockNumber + 1 <
        config.minConfirmations
      )
        return;
      // Confirmed-node visibility prevents treating an unconfirmed inclusion as final.
      const confirmed = await tron.trx.getConfirmedTransaction(hash);
      if (confirmed?.txID !== hash) return;
      if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
        await terminal(false, `CHAIN_${info.receipt.result}`);
        return;
      }
      const transfer = info.log?.some(
        (log) =>
          log.address.toLowerCase() === addressHex(config.usdtContract) &&
          log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
          log.topics?.[1]?.slice(-40).toLowerCase() ===
            addressHex(config.hotWalletAddress) &&
          log.topics?.[2]?.slice(-40).toLowerCase() ===
            addressHex(withdrawal.toAddress) &&
          BigInt(`0x${log.data}`) === withdrawal.amountSun,
      );
      if (info.receipt?.result === 'SUCCESS' && transfer) await terminal(true);
      return; // Missing transfer evidence requires investigation, never an automatic refund.
    }
    if (signed && signed.raw_data.expiration > Date.now())
      await tron.trx.sendRawTransaction(signed);
    // Expired/unknown transactions remain reserved until absence is independently established.
  } catch (error) {
    await prisma.withdrawal.updateMany({
      where: { id, status: { in: ['pending', 'processing'] } },
      data: {
        failReason:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'PAYOUT_RECONCILIATION_PENDING',
      },
    });
  } finally {
    await prisma.withdrawal.updateMany({
      where: { id, leaseUntil: new Date(now.getTime() + 120_000) },
      data: { leaseUntil: null },
    });
  }
}
