import { prisma } from '../db/client.js';
import {
  createEventId,
  deliverWebhook,
  type GatewayWebhookEvent,
} from '../webhook/sender.js';

export async function enqueueWebhook(
  event: GatewayWebhookEvent,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  await prisma.webhookDelivery.create({
    data: {
      eventId: event.eventId,
      eventType: event.type,
      payload: event,
      status: 'pending',
      nextRetryAt: new Date(),
    },
  });

  const result = await deliverWebhook({
    webhookUrl,
    webhookSecret,
    event,
  });

  await prisma.webhookDelivery.update({
    where: { eventId: event.eventId },
    data: result.ok
      ? {
          status: 'delivered',
          deliveredAt: new Date(),
          attempts: { increment: 1 },
        }
      : {
          status: 'failed',
          lastError: result.error ?? 'delivery failed',
          attempts: { increment: 1 },
        },
  });
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
