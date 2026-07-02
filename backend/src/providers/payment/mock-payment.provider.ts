import { Injectable } from '@nestjs/common';
import type {
  DepositAddressResult,
  GatewayPayment,
  GatewayWithdrawal,
  PaymentProvider,
} from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async ensureDepositAddress(userId: string): Promise<DepositAddressResult> {
    return {
      address: `TMock${userId.replace(/-/g, '').slice(0, 30)}`,
      walletIndex: 0,
    };
  }

  async createGatewayWithdrawal(): Promise<GatewayWithdrawal> {
    throw new Error('Mock payment provider does not support gateway withdrawals');
  }

  async getGatewayWithdrawal(): Promise<GatewayWithdrawal | null> {
    return null;
  }

  async listUserPayments(): Promise<GatewayPayment[]> {
    return [];
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}
