/** NORTH gateway contract — HTTP only, no gateway repo in this codebase. */

export const NORTH_PAYMENT_METHODS = ['trc20', 'bep20', 'erc20'] as const;
export type NorthPaymentMethod = (typeof NORTH_PAYMENT_METHODS)[number];

export type NorthCheckoutRequest = {
  externalId: string;
  externalUserId: string;
  amountUsd: string;
  paymentMethod: NorthPaymentMethod;
  returnUrl?: string;
};

export type NorthCheckoutSession = {
  ok: boolean;
  checkoutUrl: string;
  invoiceId: string;
  externalId: string;
  status: 'pending' | 'paid' | 'expired';
  paymentMethod: NorthPaymentMethod;
  network: NorthPaymentMethod;
  token: string;
  amountUsdt: string;
  creditUsd: string | null;
  usdtUsdRate: string | null;
  expiresAt: string;
  paidAt: string | null;
  address: string | null;
};

export type NorthWithdrawalRequest = {
  externalId: string;
  externalUserId: string;
  toAddress: string;
  paymentMethod: NorthPaymentMethod;
  amountUsdt?: string;
  amountSun?: string;
};

export type NorthWithdrawalResponse = {
  id: string;
  externalId?: string;
  status: string;
  toAddress?: string;
  amountSun?: string;
  feeSun?: string;
  payoutTxHash?: string | null;
  failReason?: string | null;
};

export class NorthGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'NorthGatewayError';
  }
}

export function isNorthPaymentMethod(value: string): value is NorthPaymentMethod {
  return (NORTH_PAYMENT_METHODS as readonly string[]).includes(value);
}
