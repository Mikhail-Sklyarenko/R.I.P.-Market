import { createHmac, randomUUID } from 'node:crypto';

export type DepositCreditedEvent = {
  eventId: string;
  type: 'deposit.credited';
  externalUserId: string;
  txHash: string;
  amountSun: string;
  address: string;
  creditedAt: string;
};

export type WithdrawalPaidEvent = {
  eventId: string;
  type: 'withdrawal.paid';
  withdrawalId: string;
  externalId?: string;
  externalUserId: string;
  payoutTxHash: string;
  amountSun: string;
  feeSun: string;
};

export type WithdrawalFailedEvent = {
  eventId: string;
  type: 'withdrawal.failed';
  withdrawalId: string;
  externalId?: string;
  externalUserId: string;
  reason: string;
};

export type GatewayWebhookEvent =
  | DepositCreditedEvent
  | WithdrawalPaidEvent
  | WithdrawalFailedEvent;

export async function deliverWebhook(params: {
  webhookUrl: string;
  webhookSecret: string;
  event: GatewayWebhookEvent;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(params.event);
  const signature = createHmac('sha256', params.webhookSecret)
    .update(body)
    .digest('hex');
  try {
    const response = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}`,
        };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Webhook failed',
    };
  }
}

export function createEventId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
