# Extension Flow Observability (M9)

Daily-ops dashboard and alert playbook for extension-first trade flow.

## Feature flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ENABLE_EXTENSION_FLOW_OBSERVABILITY` | off | Master switch for metrics, logs, alerts |
| `ENABLE_EXTENSION_RATE_LIMITS` | off | Per-user/session HTTP rate limits |
| `ENABLE_EXTENSION_ANTI_FRAUD` | off | Rule-based velocity checks |

Requires `ENABLE_EXTENSION_FLOW_OBSERVABILITY=true` for rate limits and anti-fraud.

## Endpoints

- `GET /health/metrics` — includes `extensionFlow` snapshot when enabled
- `GET /admin/metrics/extension-flow` — KPI dashboard (admin JWT)

## Metrics & target thresholds

| Metric | Label(s) | Target | Alert if |
|--------|----------|--------|----------|
| `extension_flow_completion_rate_pct` | `source` | ≥ 70% | < 70% after ≥20 orders started |
| `extension_flow_dispute_rate_pct` | `reason_code` | ≤ 15% | ≥ 15% after ≥20 orders started |
| `extension_flow_task_success_rate_pct` | — | ≥ 85% | < 85% after ≥20 tasks |
| `extension_flow_time_to_complete_ms_p95` | `source` | ≤ 30m | Sustained p95 > 45m (manual review) |
| `extension_flow_auth_errors_total` | `code` | ≤ 5 / 5m | ≥ 15 / 5m |
| `extension_flow_verify_mismatch_total` | `reason_code` | ≤ 2 / 5m | ≥ 5 / 5m |
| `extension_flow_tasks_failed_total` | `reason_code` | ≤ 5 / 5m | ≥ 10 / 5m |

## Alerts & playbooks

| Alert ID | Trigger | Action playbook |
|----------|---------|-----------------|
| `TASK_FAILURE_SPIKE` | ≥10 task failures in 5m | Check extension logs (`EXT_FLOW_TASK_FAILED`), Steam outages, seller trade URL validity. Pause `ENABLE_EXTENSION_OFFER_ORCHESTRATOR` if systemic. |
| `EXTENSION_AUTH_ANOMALY` | ≥15 auth errors in 5m | Review `EXTENSION_SECURITY_ALERT` notifications. Check for token replay / revoked devices. Restrict suspicious users via admin. |
| `VERIFY_MISMATCH_SPIKE` | ≥5 verify mismatches in 5m | Inspect delivery engine decisions; confirm Steam API health. Do **not** release holds manually without dual-signal evidence. |
| `COMPLETION_RATE_DROP` | completion < 70% (n≥20) | Compare extension vs manual `source` label. Check task pipeline TTL and orchestrator errors. |
| `DISPUTE_RATE_SPIKE` | dispute rate ≥ 15% (n≥20) | Pull order timelines (`GET /admin/orders/:id/timeline`). Triage top `reason_code` values. |
| `ANTI_FRAUD_VELOCITY` | Rule triggered | See rule: restrict user, review disputes/auth burst, verify handshake abuse. |

All alerts emit `OPS_ALERT` outbox → admin in-app notification (category: system).

## Structured log codes

- `EXT_FLOW_ORDER_STARTED` / `COMPLETED` / `DISPUTED`
- `EXT_FLOW_TASK_SUCCESS` / `TASK_FAILED`
- `EXT_FLOW_AUTH_ERROR` / `VERIFY_MISMATCH`
- `EXT_FLOW_RATE_LIMITED` / `ANTI_FRAUD_TRIGGERED` / `OPS_ALERT_FIRED`

Every log includes `correlationId` (= `requestId` from `X-Request-Id`).

## Rollback / kill-switch

1. `ENABLE_EXTENSION_FLOW_OBSERVABILITY=false` — disables metrics, alerts, anti-fraud, rate limits
2. `ENABLE_EXTENSION_RATE_LIMITS=false` — keep metrics, drop throttling only
3. `ENABLE_EXTENSION_ANTI_FRAUD=false` — keep metrics, drop blocks only

No data migration required. In-memory counters reset on restart.
