import { Injectable } from '@nestjs/common';
import type {
  DepositAddressResult,
  GatewayPayment,
  GatewayWithdrawal,
  PaymentProvider,
} from '../../src/providers/payment/payment-provider.interface';
import { verifyGatewayWebhookSignature } from '../../src/providers/payment/payment.util';

@Injectable()
export class TestCryptoPaymentProvider implements PaymentProvider {
  readonly name = 'crypto_tron';

  private readonly payments = new Map<string, GatewayPayment[]>();
  private readonly withdrawals = new Map<string, GatewayWithdrawal>();
  private withdrawalSeq = 0;

  constructor(private readonly webhookSecret: string) {}

  async ensureDepositAddress(userId: string): Promise<DepositAddressResult> {
    return {
      address: `TTest${userId.replace(/-/g, '').slice(0, 28)}`,
      walletIndex: 1,
    };
  }

  async createGatewayWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountSun: string;
  }): Promise<GatewayWithdrawal> {
    this.withdrawalSeq += 1;
    const id = `gw-wdr-${this.withdrawalSeq}`;
    const withdrawal: GatewayWithdrawal = {
      id,
      toAddress: params.toAddress,
      amountSun: params.amountSun,
      feeSun: '0',
      status: 'pending',
      payoutTxHash: null,
      failReason: null,
    };
    this.withdrawals.set(id, withdrawal);
    return withdrawal;
  }

  async getGatewayWithdrawal(id: string): Promise<GatewayWithdrawal | null> {
    return this.withdrawals.get(id) ?? null;
  }

  async listUserPayments(userId: string): Promise<GatewayPayment[]> {
    return this.payments.get(userId) ?? [];
  }

  recordCreditedPayment(userId: string, payment: GatewayPayment): void {
    const items = this.payments.get(userId) ?? [];
    items.push(payment);
    this.payments.set(userId, items);
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    return verifyGatewayWebhookSignature(this.webhookSecret, rawBody, signature);
  }
}
