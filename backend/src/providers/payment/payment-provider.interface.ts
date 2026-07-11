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

export interface PaymentProvider {
  readonly name: string;

  ensureDepositAddress(userId: string): Promise<DepositAddressResult>;

  createGatewayWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountSun: string;
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
  amountSun: string;
  address: string;
  creditedAt: string;
};

export type WithdrawalPaidWebhook = {
  eventId: string;
  type: 'withdrawal.paid';
  withdrawalId: string;
  externalUserId: string;
  payoutTxHash: string;
  amountSun: string;
  feeSun: string;
};

export type WithdrawalFailedWebhook = {
  eventId: string;
  type: 'withdrawal.failed';
  withdrawalId: string;
  externalUserId: string;
  reason: string;
};

export type PaymentWebhookPayload =
  | DepositCreditedWebhook
  | WithdrawalPaidWebhook
  | WithdrawalFailedWebhook;
