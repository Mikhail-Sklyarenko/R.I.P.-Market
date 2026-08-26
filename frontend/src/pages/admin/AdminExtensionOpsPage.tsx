import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getExtensionFlowMetrics } from '../../api/admin';
import type { ExtensionFlowMetricsResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';

function toneLabel(tone: string): string {
  if (tone === 'pass') {
    return 'OK';
  }
  if (tone === 'fail') {
    return 'FAIL';
  }
  return 'мало данных';
}

export function AdminExtensionOpsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<ExtensionFlowMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getExtensionFlowMetrics(token);
      setData(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="page">
      <PageHeader
        title="Extension Ops"
        subtitle="KPI gate, алерты, fail reasons и kill switch — привычка смотреть сюда, а не только в логи."
      />
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <button type="button" className="button secondary sm" onClick={() => void load()}>
          Обновить
        </button>
        <Link to="/admin/orders" className="button secondary sm">
          Заказы
        </Link>
        <Link to="/admin/settlement/allowlist" className="button secondary sm">
          Settlement allowlist
        </Link>
      </div>

      {error ? <ErrorAlert error={error} /> : null}
      {loading && !data ? <LoadingState /> : null}

      {data && !data.enabled ? (
        <p className="alert alert-warning" data-testid="extension-ops-disabled">
          Observability выключена. Включите <code>ENABLE_EXTENSION_FLOW_OBSERVABILITY=true</code>.
          {data.message ? ` ${data.message}` : ''}
        </p>
      ) : null}

      {data && data.enabled ? (
        <>
          <section className="card" data-testid="extension-ops-gates">
            <h3>KPI gate (process lifetime)</h3>
            <p className="muted small">
              Цели: completion ≥ {data.inMemory.gates.completion.thresholdPct}% · task success ≥{' '}
              {data.inMemory.gates.taskSuccess.thresholdPct}% · dispute ≤{' '}
              {data.inMemory.gates.dispute.thresholdPct}%
            </p>
            <div className="admin-ops-grid">
              <div className={`admin-ops-kpi ${data.inMemory.gates.overall}`}>
                <div className="label">Overall</div>
                <div className="value">{toneLabel(data.inMemory.gates.overall)}</div>
              </div>
              <div className={`admin-ops-kpi ${data.inMemory.gates.completion.tone}`}>
                <div className="label">Completion</div>
                <div className="value">{data.inMemory.gates.completion.valuePct}%</div>
                <p className="muted small">n={data.inMemory.gates.completion.sample}</p>
              </div>
              <div className={`admin-ops-kpi ${data.inMemory.gates.taskSuccess.tone}`}>
                <div className="label">Task success</div>
                <div className="value">{data.inMemory.gates.taskSuccess.valuePct}%</div>
                <p className="muted small">n={data.inMemory.gates.taskSuccess.sample}</p>
              </div>
              <div className={`admin-ops-kpi ${data.inMemory.gates.dispute.tone}`}>
                <div className="label">Dispute</div>
                <div className="value">{data.inMemory.gates.dispute.valuePct}%</div>
                <p className="muted small">n={data.inMemory.gates.dispute.sample}</p>
              </div>
            </div>
          </section>

          <section className="card" data-testid="extension-ops-rollout">
            <h3>Rollout / kill switch</h3>
            <div className="admin-ops-grid">
              <div className={`admin-ops-kpi ${data.rollout.killSwitch ? 'fail' : 'pass'}`}>
                <div className="label">Kill switch</div>
                <div className="value">{data.rollout.killSwitch ? 'ON' : 'off'}</div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Stage</div>
                <div className="value" style={{ fontSize: 16 }}>
                  {data.rollout.enabled ? data.rollout.stage : 'disabled'}
                </div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Percent</div>
                <div className="value">{data.rollout.percent}%</div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Allowlist</div>
                <div className="value">{data.rollout.allowlistCount}</div>
              </div>
            </div>
            <p className="muted small">
              Rollback &lt; {data.rollout.rollback.targetMinutes} мин:{' '}
              {data.rollout.rollback.layers[0]}
            </p>
          </section>

          <section className="card" data-testid="extension-ops-feature-flags">
            <h3>Feature flags snapshot</h3>
            <p className="muted small">
              I5 UX flags default ON when unset (<code>!== false</code>). Explicit{' '}
              <code>=false</code> kills independently.
            </p>
            <table className="admin-ops-table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.rollout.featureFlags)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <tr key={key}>
                      <td>
                        <code>{key}</code>
                      </td>
                      <td>
                        {typeof value === 'boolean'
                          ? value
                            ? 'ON'
                            : 'off'
                          : String(value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className="card" data-testid="extension-ops-alerts">
            <h3>Active alerts</h3>
            {data.activeAlerts.length === 0 ? (
              <p className="muted small">Нет активных алертов.</p>
            ) : (
              data.activeAlerts.map((alert) => (
                <div key={`${alert.alertId}-${alert.firedAt}`} className="admin-ops-alert">
                  <strong>{alert.alertId}</strong>
                  <p className="muted small">{alert.firedAt}</p>
                  <pre className="muted small" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(alert.detail, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </section>

          <section className="card" data-testid="extension-ops-fail-reasons">
            <h3>Fail reasons (24h DB)</h3>
            {data.failReasonsTop24h.length === 0 ? (
              <p className="muted small">Нет FAILED trade tasks за 24ч.</p>
            ) : (
              <table className="admin-ops-table">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.failReasonsTop24h.map((row) => (
                    <tr key={row.reasonCode}>
                      <td>
                        <code>{row.reasonCode}</code>
                      </td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h4 style={{ marginTop: 16 }}>Rolling 5m (in-memory)</h4>
            <p className="muted small">
              task_fail={data.inMemory.rolling_5m.task_failures} · auth=
              {data.inMemory.rolling_5m.auth_errors} · mismatch=
              {data.inMemory.rolling_5m.verify_mismatches}
            </p>
            {data.inMemory.rolling_5m.top_fail_reasons.length > 0 ? (
              <table className="admin-ops-table">
                <thead>
                  <tr>
                    <th>Код (5м)</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inMemory.rolling_5m.top_fail_reasons.map((row) => (
                    <tr key={`5m-${row.reasonCode}`}>
                      <td>
                        <code>{row.reasonCode}</code>
                      </td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          <section className="card" data-testid="extension-ops-db24h">
            <h3>DB 24h</h3>
            <div className="admin-ops-grid">
              <div className="admin-ops-kpi">
                <div className="label">Orders started</div>
                <div className="value">{data.db24h.orders_started}</div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Completed-ish</div>
                <div className="value">{data.db24h.orders_completed}</div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Disputes</div>
                <div className="value">{data.db24h.orders_disputed}</div>
              </div>
              <div className="admin-ops-kpi">
                <div className="label">Tasks failed</div>
                <div className="value">{data.db24h.tasks_failed}</div>
              </div>
            </div>
            <p className="muted small">
              Обновлено: {data.timestamp}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
