import { Injectable } from '@nestjs/common';
import type {
  DepositAddressResult,
  GatewayPayment,
  GatewayWithdrawal,
  PaymentProvider,
} from './payment-provider.interface';
import { verifyGatewayWebhookSignature } from './payment.util';

/**
 * In-memory crypto gateway shim for Playwright / ENABLE_TEST_ROUTES e2e.
 * MNEMONIC stays out of platform; this only fakes gateway HTTP + webhook signatures.
 */
@Injectable()
export class E2eCryptoPaymentProvider implements PaymentProvider {
  readonly name = 'crypto_tron';

  private readonly payments = new Map<string, GatewayPayment[]>();
  private readonly withdrawals = new Map<string, GatewayWithdrawal>();
  private withdrawalSeq = 0;

  private get webhookSecret(): string {
    return (
      process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET ?? 'playwright-webhook-secret'
    );
  }

  ensureDepositAddress(userId: string): Promise<DepositAddressResult> {
    return Promise.resolve({
      address: `TTest${userId.replace(/-/g, '').slice(0, 28)}`,
      walletIndex: 1,
    });
  }

  createGatewayWithdrawal(params: {
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
    return Promise.resolve(withdrawal);
  }

  getGatewayWithdrawal(id: string): Promise<GatewayWithdrawal | null> {
    return Promise.resolve(this.withdrawals.get(id) ?? null);
  }

  listUserPayments(userId: string): Promise<GatewayPayment[]> {
    return Promise.resolve(this.payments.get(userId) ?? []);
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean {
    return verifyGatewayWebhookSignature(
      this.webhookSecret,
      rawBody,
      signature,
    );
  }
}
