import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';

describe('PaymentReconciliationService', () => {
  beforeEach(() => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
  });

  it('returns ok when crypto provider is disabled', async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    const service = new PaymentReconciliationService(
      {} as PrismaService,
      { name: 'mock' } as PaymentProvider,
    );

    const report = await service.reconcile();
    expect(report.ok).toBe(true);
  });
});
