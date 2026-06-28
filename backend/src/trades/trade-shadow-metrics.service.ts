import { Injectable } from '@nestjs/common';

@Injectable()
export class TradeShadowMetricsService {
  private mismatchTotal = 0;

  recordMismatch(): void {
    this.mismatchTotal += 1;
  }

  snapshot() {
    return {
      trade_shadow_mismatch_total: this.mismatchTotal,
    };
  }
}
