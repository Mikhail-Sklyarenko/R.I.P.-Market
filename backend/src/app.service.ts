import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ExtensionFlowMetricsService } from './common/observability/extension-flow-metrics.service';
import { HttpMetricsService } from './common/observability/http-metrics.service';
import { isExtensionFlowObservabilityEnabled } from './common/observability/extension-flow-observability.config';
import { ObservabilityAlertService } from './common/observability/observability-alert.service';
import { InventoryMetricsService } from './providers/inventory/inventory-metrics.service';
import { TradeShadowMetricsService } from './trades/trade-shadow-metrics.service';
import { LedgerReconciliationService } from './wallet/ledger-reconciliation.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerReconciliation: LedgerReconciliationService,
    private readonly inventoryMetrics: InventoryMetricsService,
    private readonly shadowMetrics: TradeShadowMetricsService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
    private readonly observabilityAlerts: ObservabilityAlertService,
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
      inventory: this.inventoryMetrics.snapshot(),
      tradeShadow: this.shadowMetrics.snapshot(),
      extensionFlow: isExtensionFlowObservabilityEnabled()
        ? {
            ...this.extensionFlowMetrics.snapshot(),
            activeAlerts: this.observabilityAlerts.snapshotActiveAlerts(),
          }
        : { enabled: false },
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
