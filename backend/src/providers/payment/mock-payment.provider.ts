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

  ensureDepositAddress(userId: string): Promise<DepositAddressResult> {
    return Promise.resolve({
      address: `TMock${userId.replace(/-/g, '').slice(0, 30)}`,
      walletIndex: 0,
    });
  }

  createGatewayWithdrawal(): Promise<GatewayWithdrawal> {
    return Promise.reject(
      new Error('Mock payment provider does not support gateway withdrawals'),
    );
  }

  getGatewayWithdrawal(): Promise<GatewayWithdrawal | null> {
    return Promise.resolve(null);
  }

  listUserPayments(): Promise<GatewayPayment[]> {
    return Promise.resolve([]);
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}
