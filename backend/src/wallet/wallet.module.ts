import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AdminWalletController, WalletController } from './wallet.controller';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, AdminWalletController],
  providers: [
    WalletService,
    LedgerService,
    LedgerReconciliationService,
    RolesGuard,
  ],
  exports: [WalletService, LedgerService, LedgerReconciliationService],
})
export class WalletModule {}
