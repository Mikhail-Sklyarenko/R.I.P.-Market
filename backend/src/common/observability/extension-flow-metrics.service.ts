import { Injectable, Logger } from '@nestjs/common';
import { getAuditContext } from './audit-context';
import {
  ExtensionFlowLogCode,
  type ExtensionFlowLogCodeType,
} from './extension-flow-log-codes';
import { isExtensionFlowObservabilityEnabled } from './extension-flow-observability.config';

type OrderSource = 'extension' | 'manual';

type RollingEvent = {
  at: number;
  labels: Record<string, string>;
};

const MAX_DURATION_SAMPLES = 500;
const ROLLING_RETENTION_MS = 15 * 60 * 1000;

@Injectable()
export class ExtensionFlowMetricsService {
  private readonly logger = new Logger(ExtensionFlowMetricsService.name);

  private ordersStarted: Record<OrderSource, number> = {
    extension: 0,
    manual: 0,
  };
  private ordersCompleted = 0;
  private ordersDisputed = 0;
  private tasksSucceeded = 0;
  private tasksFailed = 0;
  private authErrors = 0;
  private verifyMismatches = 0;

  private completionDurationsMs: number[] = [];
  private rolling = new Map<string, RollingEvent[]>();
  private alertEvaluators: Array<() => void> = [];

  registerAlertEvaluator(fn: () => void): void {
    this.alertEvaluators.push(fn);
  }

  recordOrderStarted(params: {
    orderId: string;
    source: OrderSource;
    sellerId?: string;
    buyerId?: string;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    this.ordersStarted[params.source] += 1;
    this.pushRolling('order_started', {
      orderId: params.orderId,
      source: params.source,
    });
    this.emitLog(ExtensionFlowLogCode.ORDER_STARTED, 'log', {
      orderId: params.orderId,
      source: params.source,
      sellerId: params.sellerId ?? null,
      buyerId: params.buyerId ?? null,
      metric: 'extension_flow_orders_started_total',
      labels: { source: params.source },
    });
    this.runAlertEvaluators();
  }

  recordOrderCompleted(params: {
    orderId: string;
    source: OrderSource;
    startedAt?: Date;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    this.ordersCompleted += 1;
    const durationMs =
      params.startedAt !== undefined
        ? Math.max(0, Date.now() - params.startedAt.getTime())
        : null;
    if (durationMs !== null) {
      this.completionDurationsMs.push(durationMs);
      if (this.completionDurationsMs.length > MAX_DURATION_SAMPLES) {
        this.completionDurationsMs.shift();
      }
    }
    this.pushRolling('order_completed', {
      orderId: params.orderId,
      source: params.source,
    });
    this.emitLog(ExtensionFlowLogCode.ORDER_COMPLETED, 'log', {
      orderId: params.orderId,
      source: params.source,
      durationMs,
      metric: 'extension_flow_orders_completed_total',
      labels: { source: params.source },
    });
    this.runAlertEvaluators();
  }

  recordOrderDisputed(params: {
    orderId: string;
    reasonCode: string;
    source?: string;
    sellerId?: string;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    this.ordersDisputed += 1;
    this.pushRolling('order_disputed', {
      orderId: params.orderId,
      reasonCode: params.reasonCode,
    });
    this.emitLog(ExtensionFlowLogCode.ORDER_DISPUTED, 'warn', {
      orderId: params.orderId,
      reasonCode: params.reasonCode,
      source: params.source ?? null,
      sellerId: params.sellerId ?? null,
      metric: 'extension_flow_orders_disputed_total',
      labels: { reason_code: params.reasonCode },
    });
    this.runAlertEvaluators();
  }

  recordTaskOutcome(params: {
    orderId: string;
    taskId: string;
    success: boolean;
    reasonCode?: string | null;
    sellerId?: string;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    if (params.success) {
      this.tasksSucceeded += 1;
      this.pushRolling('task_success', { orderId: params.orderId });
      this.emitLog(ExtensionFlowLogCode.TASK_SUCCESS, 'log', {
        orderId: params.orderId,
        taskId: params.taskId,
        sellerId: params.sellerId ?? null,
        metric: 'extension_flow_tasks_succeeded_total',
      });
    } else {
      this.tasksFailed += 1;
      this.pushRolling('task_failed', {
        orderId: params.orderId,
        reasonCode: params.reasonCode ?? 'unknown',
      });
      this.emitLog(ExtensionFlowLogCode.TASK_FAILED, 'warn', {
        orderId: params.orderId,
        taskId: params.taskId,
        reasonCode: params.reasonCode ?? null,
        sellerId: params.sellerId ?? null,
        metric: 'extension_flow_tasks_failed_total',
        alert: true,
      });
    }
    this.runAlertEvaluators();
  }

  recordAuthError(params: {
    code: string;
    userId?: string;
    sessionId?: string;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    this.authErrors += 1;
    this.pushRolling('auth_error', {
      code: params.code,
      userId: params.userId ?? 'unknown',
    });
    this.emitLog(ExtensionFlowLogCode.AUTH_ERROR, 'warn', {
      code: params.code,
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
      metric: 'extension_flow_auth_errors_total',
      labels: { code: params.code },
      alert: true,
    });
    this.runAlertEvaluators();
  }

  recordVerifyMismatch(params: {
    orderId: string;
    reasonCode: string;
    source: string;
  }): void {
    if (!isExtensionFlowObservabilityEnabled()) {
      return;
    }
    this.verifyMismatches += 1;
    this.pushRolling('verify_mismatch', {
      orderId: params.orderId,
      reasonCode: params.reasonCode,
      source: params.source,
    });
    this.emitLog(ExtensionFlowLogCode.VERIFY_MISMATCH, 'warn', {
      orderId: params.orderId,
      reasonCode: params.reasonCode,
      source: params.source,
      metric: 'extension_flow_verify_mismatch_total',
      labels: { reason_code: params.reasonCode },
      alert: true,
    });
    this.runAlertEvaluators();
  }

  countRolling(metric: string, windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    const events = this.rolling.get(metric) ?? [];
    return events.filter((event) => event.at >= cutoff).length;
  }

  snapshotKpis() {
    const ordersStartedTotal =
      this.ordersStarted.extension + this.ordersStarted.manual;
    const tasksTotal = this.tasksSucceeded + this.tasksFailed;
    const durations = [...this.completionDurationsMs].sort((a, b) => a - b);

    return {
      counters: {
        extension_flow_orders_started_total: ordersStartedTotal,
        extension_flow_orders_started_extension_total:
          this.ordersStarted.extension,
        extension_flow_orders_started_manual_total: this.ordersStarted.manual,
        extension_flow_orders_completed_total: this.ordersCompleted,
        extension_flow_orders_disputed_total: this.ordersDisputed,
        extension_flow_tasks_succeeded_total: this.tasksSucceeded,
        extension_flow_tasks_failed_total: this.tasksFailed,
        extension_flow_auth_errors_total: this.authErrors,
        extension_flow_verify_mismatch_total: this.verifyMismatches,
      },
      rates: {
        extension_flow_completion_rate_pct: pct(
          this.ordersCompleted,
          ordersStartedTotal,
        ),
        extension_flow_dispute_rate_pct: pct(
          this.ordersDisputed,
          ordersStartedTotal,
        ),
        extension_flow_task_success_rate_pct: pct(
          this.tasksSucceeded,
          tasksTotal,
        ),
      },
      latency: {
        extension_flow_time_to_complete_ms_avg: avg(durations),
        extension_flow_time_to_complete_ms_p95: percentile(durations, 0.95),
        extension_flow_time_to_complete_ms_samples: durations.length,
      },
      rolling_5m: {
        task_failures: this.countRolling('task_failed', 5 * 60 * 1000),
        auth_errors: this.countRolling('auth_error', 5 * 60 * 1000),
        verify_mismatches: this.countRolling('verify_mismatch', 5 * 60 * 1000),
        orders_completed: this.countRolling('order_completed', 5 * 60 * 1000),
        orders_disputed: this.countRolling('order_disputed', 5 * 60 * 1000),
      },
    };
  }

  snapshot() {
    return this.snapshotKpis();
  }

  private pushRolling(metric: string, labels: Record<string, string>): void {
    const events = this.rolling.get(metric) ?? [];
    events.push({ at: Date.now(), labels });
    const cutoff = Date.now() - ROLLING_RETENTION_MS;
    while (events.length > 0 && events[0].at < cutoff) {
      events.shift();
    }
    this.rolling.set(metric, events);
  }

  private runAlertEvaluators(): void {
    for (const evaluate of this.alertEvaluators) {
      evaluate();
    }
  }

  private emitLog(
    code: ExtensionFlowLogCodeType,
    level: 'log' | 'warn',
    fields: Record<string, unknown>,
  ): void {
    const { requestId } = getAuditContext();
    const payload = {
      event: code,
      logCode: code,
      trace: 'extension-flow',
      correlationId: requestId,
      requestId,
      ...fields,
    };
    this.logger[level](JSON.stringify(payload));
  }
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );
  return sorted[index];
}
