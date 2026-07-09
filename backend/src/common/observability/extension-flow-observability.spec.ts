import { ExtensionFlowMetricsService } from './extension-flow-metrics.service';
import { ObservabilityAlertService } from './observability-alert.service';
import { OpsAlertId } from './extension-flow-log-codes';
import { AntiFraudRuleService } from './anti-fraud.service';
import { ExtensionRateLimitService } from './extension-rate-limit.service';

describe('ExtensionFlowMetricsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ENABLE_EXTENSION_FLOW_OBSERVABILITY: 'true' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('computes KPI rates from counters', () => {
    const service = new ExtensionFlowMetricsService();
    service.recordOrderStarted({ orderId: 'o1', source: 'extension' });
    service.recordOrderStarted({ orderId: 'o2', source: 'manual' });
    service.recordOrderCompleted({
      orderId: 'o1',
      source: 'extension',
      startedAt: new Date(Date.now() - 60_000),
    });
    service.recordOrderDisputed({ orderId: 'o2', reasonCode: 'TEST' });
    service.recordTaskOutcome({ orderId: 'o1', taskId: 't1', success: true });
    service.recordTaskOutcome({
      orderId: 'o2',
      taskId: 't2',
      success: false,
      reasonCode: 'FAIL',
    });

    const snapshot = service.snapshotKpis();
    expect(snapshot.counters.extension_flow_orders_started_total).toBe(2);
    expect(snapshot.rates.extension_flow_completion_rate_pct).toBe(50);
    expect(snapshot.rates.extension_flow_dispute_rate_pct).toBe(50);
    expect(snapshot.rates.extension_flow_task_success_rate_pct).toBe(50);
    expect(snapshot.latency.extension_flow_time_to_complete_ms_samples).toBe(1);
  });

  it('no-ops when observability flag is disabled', () => {
    process.env.ENABLE_EXTENSION_FLOW_OBSERVABILITY = 'false';
    const service = new ExtensionFlowMetricsService();
    service.recordOrderStarted({ orderId: 'o1', source: 'extension' });
    expect(service.snapshotKpis().counters.extension_flow_orders_started_total).toBe(0);
  });
});

describe('ObservabilityAlertService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ENABLE_EXTENSION_FLOW_OBSERVABILITY: 'true' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fires OPS_ALERT outbox on task failure spike', async () => {
    const metrics = new ExtensionFlowMetricsService();
    const prisma = {
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };
    const alerts = new ObservabilityAlertService(
      prisma as never,
      metrics,
    );
    alerts.onModuleInit();

    process.env.EXT_FLOW_ALERT_TASK_FAIL_SPIKE_5M = '2';
    for (let i = 0; i < 2; i += 1) {
      metrics.recordTaskOutcome({
        orderId: `o${i}`,
        taskId: `t${i}`,
        success: false,
      });
    }

    await alerts.evaluateThresholds();

    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'OPS_ALERT',
          aggregateId: OpsAlertId.TASK_FAILURE_SPIKE,
        }),
      }),
    );
    expect(alerts.snapshotActiveAlerts()).toHaveLength(1);
  });
});

describe('AntiFraudRuleService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENABLE_EXTENSION_FLOW_OBSERVABILITY: 'true',
      ENABLE_EXTENSION_ANTI_FRAUD: 'true',
      EXT_FLOW_AF_AUTH_FAIL_5M: '2',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('blocks after auth failure burst', () => {
    const metrics = new ExtensionFlowMetricsService();
    const alerts = {
      maybeFireAlert: jest.fn(),
      fireAntiFraudAlert: jest.fn(),
    };
    const service = new AntiFraudRuleService(metrics, alerts as never);

    service.recordAuthFailure('user-1', 'EXT_SEC_TOKEN_INVALID');
    expect(() =>
      service.recordAuthFailure('user-1', 'EXT_SEC_TOKEN_INVALID'),
    ).toThrow('Extension access temporarily blocked');
  });
});

describe('ExtensionRateLimitService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENABLE_EXTENSION_FLOW_OBSERVABILITY: 'true',
      ENABLE_EXTENSION_RATE_LIMITS: 'true',
      EXT_FLOW_RL_HANDSHAKE_PER_HOUR: '1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when handshake rate limit exceeded', () => {
    const service = new ExtensionRateLimitService();
    service.assertHandshakeAllowed('user-1');
    expect(() => service.assertHandshakeAllowed('user-1')).toThrow(
      'Extension rate limit exceeded',
    );
  });
});
