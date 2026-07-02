import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { WalletPaymentsController } from './wallet-payments.controller';
import { WithdrawalGuardService } from './withdrawal-guard.service';

@Module({
  imports: [WalletModule],
  controllers: [
    WalletPaymentsController,
    PaymentsWebhookController,
    AdminPaymentsController,
  ],
  providers: [PaymentsService, PaymentReconciliationService, WithdrawalGuardService],
  exports: [PaymentsService, PaymentReconciliationService],
})
export class PaymentsModule {}
