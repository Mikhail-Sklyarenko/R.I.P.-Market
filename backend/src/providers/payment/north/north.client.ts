import {
  NorthGatewayError,
  isNorthPaymentMethod,
  type NorthCheckoutRequest,
  type NorthCheckoutSession,
  type NorthPaymentMethod,
  type NorthWithdrawalRequest,
  type NorthWithdrawalResponse,
} from './north.types';

export type NorthClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

function joinUrl(base: string, path: string): string {
  const root = String(base || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

/**
 * Platform → NORTH. Call only from the backend.
 * Never expose apiKey to the browser.
 */
export class NorthClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: NorthClientOptions) {
    if (!opts.baseUrl) {
      throw new Error('NORTH_GATEWAY_URL is required');
    }
    if (!opts.apiKey) {
      throw new Error('NORTH_GATEWAY_API_KEY is required');
    }
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  async createCheckout(input: NorthCheckoutRequest): Promise<NorthCheckoutSession> {
    assertPaymentMethod(input.paymentMethod);
    if (!input.externalId) {
      throw new Error('externalId is required');
    }
    if (!input.externalUserId) {
      throw new Error('externalUserId is required');
    }
    if (!input.amountUsd) {
      throw new Error('amountUsd is required');
    }

    return this.request<NorthCheckoutSession>('POST', '/v1/checkout', {
      externalId: input.externalId,
      externalUserId: input.externalUserId,
      amountUsd: input.amountUsd,
      paymentMethod: input.paymentMethod,
      returnUrl: input.returnUrl,
    });
  }

  async getCheckout(invoiceIdOrExternalId: string): Promise<NorthCheckoutSession> {
    return this.request<NorthCheckoutSession>(
      'GET',
      `/v1/checkout/${encodeURIComponent(invoiceIdOrExternalId)}`,
    );
  }

  async createWithdrawal(
    input: NorthWithdrawalRequest,
  ): Promise<NorthWithdrawalResponse> {
    assertPaymentMethod(input.paymentMethod);
    return this.request<NorthWithdrawalResponse>('POST', '/v1/withdrawals', {
      externalId: input.externalId,
      externalUserId: input.externalUserId,
      toAddress: input.toAddress,
      paymentMethod: input.paymentMethod,
      amountUsdt: input.amountUsdt,
      amountSun: input.amountSun,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await fetch(joinUrl(this.baseUrl, path), {
        method,
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
      }
      if (!res.ok) {
        const errBody = json as { error?: string } | null;
        throw new NorthGatewayError(
          errBody?.error || `NORTH ${res.status}`,
          res.status,
          json,
        );
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function assertPaymentMethod(
  value: string,
): asserts value is NorthPaymentMethod {
  if (!isNorthPaymentMethod(value)) {
    throw new Error(
      `paymentMethod must be exactly trc20, bep20, or erc20 (got "${value}")`,
    );
  }
}
