import { Injectable } from '@nestjs/common';

type InventorySyncMetricStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'CACHE_HIT';

@Injectable()
export class InventoryMetricsService {
  private readonly counters = new Map<InventorySyncMetricStatus, number>([
    ['SUCCESS', 0],
    ['FAILED', 0],
    ['PARTIAL', 0],
    ['CACHE_HIT', 0],
  ]);

  private readonly durationsMs: number[] = [];

  recordSync(status: InventorySyncMetricStatus, durationMs: number): void {
    this.counters.set(status, (this.counters.get(status) ?? 0) + 1);
    this.durationsMs.push(durationMs);
    if (this.durationsMs.length > 500) {
      this.durationsMs.shift();
    }
  }

  snapshot() {
    const total = [...this.counters.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    const durationMs =
      this.durationsMs.length > 0
        ? Math.round(
            this.durationsMs.reduce((sum, value) => sum + value, 0) /
              this.durationsMs.length,
          )
        : 0;

    return {
      inventory_sync_total: Object.fromEntries(this.counters.entries()),
      inventory_sync_duration_ms: durationMs,
      inventory_sync_count: total,
    };
  }
}
