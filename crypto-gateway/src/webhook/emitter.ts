import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  createEventId,
  deliverWebhook,
  type GatewayWebhookEvent,
} from '../webhook/sender.js';

export async function enqueueWebhook(
  event: GatewayWebhookEvent,
  _webhookUrl: string,
  _webhookSecret: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.webhookDelivery.upsert({
    where: { eventId: event.eventId },
    update: {},
    create: {
      eventId: event.eventId,
      eventType: event.type,
      payload: event,
      status: 'pending',
      nextRetryAt: new Date(),
    },
  });
}

export async function flushWebhookQueue(
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  const now = new Date();
  const rows = await prisma.webhookDelivery.findMany({
    where: {
      status: { not: 'delivered' },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });
  for (const row of rows) {
    const lease = await prisma.webhookDelivery.updateMany({
      where: {
        id: row.id,
        status: { not: 'delivered' },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: { nextRetryAt: new Date(Date.now() + 120_000) },
    });
    if (lease.count !== 1) continue;
    const result = await deliverWebhook({
      webhookUrl,
      webhookSecret,
      event: row.payload as unknown as GatewayWebhookEvent,
    });
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: result.ok
        ? {
            status: 'delivered',
            deliveredAt: new Date(),
            attempts: { increment: 1 },
          }
        : {
            status: 'pending',
            attempts: { increment: 1 },
            lastError: result.error,
            nextRetryAt: new Date(
              Date.now() +
                Math.min(3_600_000, 1000 * 2 ** Math.min(row.attempts, 12)),
            ),
          },
    });
  }
}

export async function emitDepositCredited(params: {
  externalUserId: string;
  txHash: string;
  amountSun: bigint;
  address: string;
  creditedAt: Date;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<string> {
  const eventId = createEventId('dep');
  const event: GatewayWebhookEvent = {
    eventId,
    type: 'deposit.credited',
    externalUserId: params.externalUserId,
    txHash: params.txHash,
    amountSun: params.amountSun.toString(),
    address: params.address,
    creditedAt: params.creditedAt.toISOString(),
  };

  await enqueueWebhook(event, params.webhookUrl, params.webhookSecret);
  return eventId;
}

export async function emitWithdrawalPaid(params: {
  withdrawalId: string;
  externalUserId: string;
  payoutTxHash: string;
  amountSun: bigint;
  feeSun: bigint;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<string> {
  const eventId = createEventId('wdr');
  const event: GatewayWebhookEvent = {
    eventId,
    type: 'withdrawal.paid',
    withdrawalId: params.withdrawalId,
    externalUserId: params.externalUserId,
    payoutTxHash: params.payoutTxHash,
    amountSun: params.amountSun.toString(),
    feeSun: params.feeSun.toString(),
  };

  await enqueueWebhook(event, params.webhookUrl, params.webhookSecret);
  return eventId;
}

export async function emitWithdrawalFailed(params: {
  withdrawalId: string;
  externalUserId: string;
  reason: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<string> {
  const eventId = createEventId('wdf');
  const event: GatewayWebhookEvent = {
    eventId,
    type: 'withdrawal.failed',
    withdrawalId: params.withdrawalId,
    externalUserId: params.externalUserId,
    reason: params.reason,
  };

  await enqueueWebhook(event, params.webhookUrl, params.webhookSecret);
  return eventId;
}
