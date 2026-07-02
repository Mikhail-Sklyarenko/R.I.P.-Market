import { createHmac } from 'node:crypto';
import { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const WEBHOOK_SECRET =
  process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET ?? 'playwright-webhook-secret';

const VALID_TEST_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

export { VALID_TEST_ADDRESS };

function signWebhook(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

export function decodeUserIdFromToken(token: string): string {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Invalid JWT token');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub: string;
  };
  return decoded.sub;
}

export async function creditCryptoDeposit(
  request: APIRequestContext,
  params: {
    token: string;
    userId: string;
    amountMinor: number;
    eventId?: string;
    txHash?: string;
    address?: string;
  },
): Promise<void> {
  const depositResponse = await request.get(`${API_BASE}/wallet/deposit`, {
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!depositResponse.ok()) {
    const details = await depositResponse.text();
    throw new Error(`Failed to load deposit info: ${depositResponse.status()} ${details}`);
  }
  const deposit = (await depositResponse.json()) as { address: string };

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    eventId: params.eventId ?? `pw-dep-${suffix}`,
    type: 'deposit.credited' as const,
    externalUserId: params.userId,
    txHash: params.txHash ?? `pw-tx-${suffix}`,
    amountSun: String(params.amountMinor * 10_000),
    address: params.address ?? deposit.address,
    creditedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  const response = await request.post(`${API_BASE}/payments/webhooks/crypto`, {
    headers: {
      'X-Gateway-Signature': signWebhook(body),
      'Content-Type': 'application/json',
    },
    data: payload,
  });
  if (!response.ok()) {
    throw new Error(`Deposit webhook failed: ${response.status()} ${await response.text()}`);
  }
}

export async function simulateWithdrawalPaid(
  request: APIRequestContext,
  params: {
    withdrawalId: string;
    amountMinor: number;
    payoutTxHash?: string;
    eventId?: string;
    externalUserId: string;
  },
): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    eventId: params.eventId ?? `pw-wdr-paid-${suffix}`,
    type: 'withdrawal.paid' as const,
    externalUserId: params.externalUserId,
    withdrawalId: params.withdrawalId,
    payoutTxHash: params.payoutTxHash ?? `pw-payout-${suffix}`,
    amountSun: String(params.amountMinor * 10_000),
    paidAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  const response = await request.post(`${API_BASE}/payments/webhooks/crypto`, {
    headers: {
      'X-Gateway-Signature': signWebhook(body),
      'Content-Type': 'application/json',
    },
    data: payload,
  });
  if (!response.ok()) {
    throw new Error(
      `Withdrawal paid webhook failed: ${response.status()} ${await response.text()}`,
    );
  }
}

export async function linkSteamForUser(
  request: APIRequestContext,
  userId: string,
  steamId = '765611981111111111',
): Promise<void> {
  const response = await request.post(`${API_BASE}/test/link-steam`, {
    data: { userId, steamId },
  });
  const body = (await response.json()) as { ok: boolean };
  if (!body.ok) {
    throw new Error('Failed to link steam for test user');
  }
}

export async function fundWallet(
  request: APIRequestContext,
  token: string,
  amountMinor: number,
): Promise<void> {
  const userId = decodeUserIdFromToken(token);
  await creditCryptoDeposit(request, { token, userId, amountMinor });
}
