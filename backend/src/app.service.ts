import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { LedgerReconciliationService } from './wallet/ledger-reconciliation.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerReconciliation: LedgerReconciliationService,
  ) {}

  async getHealth() {
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        service: 'cs2-p2p-backend',
        status: 'ok',
        database: 'ok',
        timestamp,
      };
    } catch {
      return {
        service: 'cs2-p2p-backend',
        status: 'degraded',
        database: 'unavailable',
        timestamp,
      };
    }
  }

  getMetrics(httpMetrics: { snapshot: () => Record<string, number> }) {
    return {
      http: httpMetrics.snapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  reconcileLedger() {
    return this.ledgerReconciliation.reconcile().then(async (report) => {
      if (!report.ok) {
        await this.ledgerReconciliation.publishFailureAlert(report);
      }
      return report;
    });
  }
}
