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
  externalUserId: string;
  payoutTxHash: string;
  amountSun: string;
  feeSun: string;
};

export type WithdrawalFailedEvent = {
  eventId: string;
  type: 'withdrawal.failed';
  withdrawalId: string;
  externalUserId: string;
  reason: string;
};

export type GatewayWebhookEvent =
  | DepositCreditedEvent
  | WithdrawalPaidEvent
  | WithdrawalFailedEvent;

const MAX_ATTEMPTS = 5;

function signBody(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** attempt);
}

export async function deliverWebhook(params: {
  webhookUrl: string;
  webhookSecret: string;
  event: GatewayWebhookEvent;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(params.event);
  const signature = signBody(params.webhookSecret, body);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(params.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Signature': signature,
        },
        body,
      });

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      if (response.status >= 400 && response.status < 500) {
        return {
          ok: false,
          status: response.status,
          error: `Client error: ${response.status}`,
        };
      }
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Webhook failed',
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
  }

  return { ok: false, error: 'Max webhook retries exceeded' };
}

export function createEventId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
