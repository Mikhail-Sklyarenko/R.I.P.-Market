export type GatewayUser = {
  externalUserId: string;
  address: string;
  walletIndex: number;
  balanceSun: string;
  createdAt: string;
};

export type GatewayWithdrawal = {
  id: string;
  toAddress: string;
  amountSun: string;
  feeSun: string;
  status: string;
  payoutTxHash: string | null;
  failReason: string | null;
};

export type GatewayPayment = {
  txHash: string;
  amountSun: string;
  status: string;
};

export type DepositAddressResult = {
  address: string;
  walletIndex: number;
};

export type CheckoutSessionResult = {
  checkoutUrl: string;
  invoiceId: string;
  externalId: string;
  paymentMethod: string;
  amountUsd: string;
  creditUsd: string | null;
  expiresAt: string;
  address: string | null;
};

export type PaymentDepositMode = 'address' | 'checkout';

export interface PaymentProvider {
  readonly name: string;
  /** Defaults to address-based (legacy crypto_tron). */
  readonly depositMode?: PaymentDepositMode;

  ensureDepositAddress(userId: string): Promise<DepositAddressResult>;

  /** Checkout-based deposits (NORTH). Required when depositMode === 'checkout'. */
  createCheckout?(params: {
    externalId: string;
    userId: string;
    amountUsd: string;
    paymentMethod: 'trc20' | 'bep20' | 'erc20';
    returnUrl?: string;
  }): Promise<CheckoutSessionResult>;

  createGatewayWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountSun: string;
    externalId?: string;
    paymentMethod?: 'trc20' | 'bep20' | 'erc20';
  }): Promise<GatewayWithdrawal>;

  getGatewayWithdrawal(id: string): Promise<GatewayWithdrawal | null>;

  listUserPayments(userId: string): Promise<GatewayPayment[]>;

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean;
}

export type DepositCreditedWebhook = {
  eventId: string;
  type: 'deposit.credited';
  externalUserId: string;
  txHash: string;
  /** Legacy crypto_tron path (1 USDT = 1 USD via sun). */
  amountSun?: string;
  address?: string;
  creditedAt?: string;
  /** NORTH: credit this USD amount to ledger (not amountUsdt 1:1). */
  creditUsd?: string | null;
  externalId?: string;
  invoiceId?: string;
  paymentMethod?: string;
  amountUsdt?: string;
  network?: string;
};

export type WithdrawalPaidWebhook = {
  eventId: string;
  type: 'withdrawal.paid';
  withdrawalId: string;
  externalUserId: string;
  payoutTxHash: string | null;
  amountSun?: string;
  feeSun?: string;
  externalId?: string;
  paymentMethod?: string;
};

export type WithdrawalFailedWebhook = {
  eventId: string;
  type: 'withdrawal.failed';
  withdrawalId: string;
  externalUserId: string;
  reason: string;
  externalId?: string;
  paymentMethod?: string;
};

export type PaymentWebhookPayload =
  | DepositCreditedWebhook
  | WithdrawalPaidWebhook
  | WithdrawalFailedWebhook;
