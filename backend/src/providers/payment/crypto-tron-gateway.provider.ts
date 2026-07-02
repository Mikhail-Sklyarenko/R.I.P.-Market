import { Injectable } from '@nestjs/common';
import { getPaymentConfig } from './payment.config';
import type {
  DepositAddressResult,
  GatewayPayment,
  GatewayUser,
  GatewayWithdrawal,
  PaymentProvider,
} from './payment-provider.interface';
import { verifyGatewayWebhookSignature } from './payment.util';

@Injectable()
export class CryptoTronGatewayProvider implements PaymentProvider {
  readonly name = 'crypto_tron';
  private readonly config = getPaymentConfig();

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.config.gatewayUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.gatewayApiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway ${method} ${path} failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async ensureDepositAddress(userId: string): Promise<DepositAddressResult> {
    const user = await this.request<GatewayUser>('POST', '/v1/users', {
      externalUserId: userId,
    });
    return {
      address: user.address,
      walletIndex: user.walletIndex,
    };
  }

  async createGatewayWithdrawal(params: {
    userId: string;
    toAddress: string;
    amountSun: string;
  }): Promise<GatewayWithdrawal> {
    return this.request<GatewayWithdrawal>('POST', '/v1/withdrawals', {
      externalUserId: params.userId,
      toAddress: params.toAddress,
      amountSun: params.amountSun,
    });
  }

  async getGatewayWithdrawal(id: string): Promise<GatewayWithdrawal | null> {
    const response = await fetch(
      `${this.config.gatewayUrl}/v1/withdrawals/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${this.config.gatewayApiKey}` },
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Gateway get withdrawal failed: ${response.status}`);
    }
    return response.json() as Promise<GatewayWithdrawal>;
  }

  async listUserPayments(userId: string): Promise<GatewayPayment[]> {
    const data = await this.request<{ items?: GatewayPayment[] }>(
      'GET',
      `/v1/users/${encodeURIComponent(userId)}/payments`,
    );
    return data.items ?? [];
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    return verifyGatewayWebhookSignature(
      this.config.webhookSecret,
      rawBody,
      signature,
    );
  }
}
