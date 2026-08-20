import { Injectable } from '@nestjs/common';
import { getPaymentConfig } from '../payment.config';
import type {
  CheckoutSessionResult,
  DepositAddressResult,
  GatewayPayment,
  GatewayWithdrawal,
  PaymentProvider,
} from '../payment-provider.interface';
import { verifyGatewayWebhookSignature } from '../payment.util';
import { NorthClient } from './north.client';
import { NorthGatewayError } from './north.types';
import type { NorthPaymentMethod } from './north.types';

@Injectable()
export class NorthGatewayProvider implements PaymentProvider {
  readonly name = 'north';
  readonly depositMode = 'checkout' as const;

  private client: NorthClient | null = null;

  private getClient(): NorthClient {
    if (!this.client) {
      const config = getPaymentConfig();
      this.client = new NorthClient({
        baseUrl: config.gatewayUrl,
        apiKey: config.gatewayApiKey,
      });
    }
    return this.client;
  }

  ensureDepositAddress(): Promise<DepositAddressResult> {
    return Promise.reject(
      new Error(
        'NORTH uses checkout sessions — call createCheckout instead of ensureDepositAddress',
      ),
    );
  }

  async createCheckout(params: {
    externalId: string;
    userId: string;
    amountUsd: string;
    paymentMethod: NorthPaymentMethod;
    returnUrl?: string;
  }): Promise<CheckoutSessionResult> {
    try {
      const session = await this.getClient().createCheckout({
        externalId: params.externalId,
        externalUserId: params.userId,
        amountUsd: params.amountUsd,
        paymentMethod: params.paymentMethod,
        returnUrl: params.returnUrl,
      });
      return {
        checkoutUrl: session.checkoutUrl,
        invoiceId: session.invoiceId,
        externalId: session.externalId,
        paymentMethod: session.paymentMethod,
        amountUsd: session.creditUsd ?? params.amountUsd,
        creditUsd: session.creditUsd,
        expiresAt: session.expiresAt,
        address: session.address,
      };
    } catch (error) {
      if (error instanceof NorthGatewayError) {
        throw error;
      }
      throw error;
    }
  }

  async createGatewayWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountSun: string;
    externalId?: string;
    paymentMethod?: NorthPaymentMethod;
  }): Promise<GatewayWithdrawal> {
    const paymentMethod = params.paymentMethod ?? 'trc20';
    const externalId = params.externalId ?? `wd_${params.userId}_${Date.now()}`;
    const result = await this.getClient().createWithdrawal({
      externalId,
      externalUserId: params.userId,
      toAddress: params.toAddress,
      paymentMethod,
      amountSun: params.amountSun,
    });

    return {
      id: result.id,
      toAddress: result.toAddress ?? params.toAddress,
      amountSun: result.amountSun ?? params.amountSun,
      feeSun: result.feeSun ?? '0',
      status: result.status,
      payoutTxHash: result.payoutTxHash ?? null,
      failReason: result.failReason ?? null,
    };
  }

  async getGatewayWithdrawal(id: string): Promise<GatewayWithdrawal | null> {
    const config = getPaymentConfig();
    const response = await fetch(
      `${config.gatewayUrl.replace(/\/$/, '')}/v1/withdrawals/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${config.gatewayApiKey}` },
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`NORTH get withdrawal failed: ${response.status}`);
    }
    const result = (await response.json()) as GatewayWithdrawal;
    return result;
  }

  listUserPayments(): Promise<GatewayPayment[]> {
    // NORTH is checkout-based; payment list reconciliation is not available yet.
    return Promise.resolve([]);
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean {
    const config = getPaymentConfig();
    return verifyGatewayWebhookSignature(
      config.webhookSecret,
      rawBody,
      signature,
    );
  }
}
