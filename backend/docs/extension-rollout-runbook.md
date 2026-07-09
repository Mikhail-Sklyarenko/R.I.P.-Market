# Extension Rollout Runbook (M10)

Staged production rollout for extension-first trade flow with **< 10 minute rollback** and **in-flight order safety**.

## Feature flags matrix

| Flag | Layer | Default | Purpose |
|------|-------|---------|---------|
| `ENABLE_EXTENSION_CHANNEL` | API | off | Loads extension module / endpoints |
| `ENABLE_EXTENSION_ROLLOUT` | Rollout | off | Enables staged seller gating (M10) |
| `EXTENSION_ROLLOUT_STAGE` | Rollout | `off` | `off` \| `internal` \| `allowlist` \| `percent` |
| `EXTENSION_ROLLOUT_KILL_SWITCH` | Kill | off | **Instant stop** for new extension tasks |
| `EXTENSION_ROLLOUT_INFLIGHT_GRACE` | Kill | on | In-flight orders keep extension path under kill switch |
| `ENABLE_EXTENSION_TASK_PIPELINE` | Pipeline | off | Creates `TradeTask` on order buy |
| `ENABLE_EXTENSION_OFFER_ORCHESTRATOR` | Pipeline | off | Task progress / offer automation |
| `ENABLE_EXTENSION_TRADE_REFERENCE` | Pipeline | off | Extension trade-reference endpoint |
| `ENABLE_EXTENSION_FIRST_TRADE_FLOW` | Settlement | off | Delivery-verified + hold window path |
| `ENABLE_DELIVERY_VERIFICATION_ENGINE` | Verification | off | Dual-signal delivery engine |
| `ENABLE_SETTLEMENT_HOLD_WINDOW` | Settlement | off | 8-day hold after trade confirm |
| `ENABLE_EXTENSION_DISPUTE_BRIDGE` | Disputes | off | Auto-dispute from extension errors |
| `ENABLE_EXTENSION_FLOW_OBSERVABILITY` | Ops | off | Metrics, alerts, anti-fraud |

### Rollout env (M10)

| Variable | Example | Notes |
|----------|---------|-------|
| `EXTENSION_ROLLOUT_INTERNAL_USER_IDS` | `uuid1,uuid2` | Stage 1: internal sellers |
| `EXTENSION_ROLLOUT_INTERNAL_STEAM_IDS` | `76561198…` | Stage 1: internal Steam IDs |
| `EXTENSION_ROLLOUT_ALLOWLIST_STEAM_IDS` | `76561198…` | Stage 2: env allowlist |
| `EXTENSION_ROLLOUT_PERCENT` | `10` | Stage 3: % of non-allowlisted sellers (stable hash) |

DB allowlist: `ExtensionRolloutAllowlistEntry` via admin API.

---

## Staged rollout by environment

### Stage 0 — Dev / CI (manual baseline)
```bash
ENABLE_EXTENSION_ROLLOUT=false
# All extension flags off — manual PATCH /orders/:id/trade-reference only
```
**Gate:** existing e2e + manual flow smoke pass.

### Stage 1 — Internal (`EXTENSION_ROLLOUT_STAGE=internal`)
```bash
ENABLE_EXTENSION_ROLLOUT=true
EXTENSION_ROLLOUT_STAGE=internal
EXTENSION_ROLLOUT_KILL_SWITCH=false
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
ENABLE_EXTENSION_FIRST_TRADE_FLOW=true
ENABLE_DELIVERY_VERIFICATION_ENGINE=true
ENABLE_SETTLEMENT_HOLD_WINDOW=true
ENABLE_EXTENSION_FLOW_OBSERVABILITY=true
EXTENSION_ROLLOUT_INTERNAL_STEAM_IDS=<team-steam-ids>
```
**Gate:** internal sellers complete 5+ trades, zero money-release incidents, dispute rate < 15%.

### Stage 2 — Allowlist sellers (`EXTENSION_ROLLOUT_STAGE=allowlist`)
```bash
EXTENSION_ROLLOUT_STAGE=allowlist
# Add sellers via:
# POST /admin/rollout/extension/allowlist/:steamId
```
**Gate:** allowlist completion rate ≥ 70%, task success ≥ 85%, no `OPS_ALERT` spikes for 24h.

### Stage 3 — Percent rollout (`EXTENSION_ROLLOUT_STAGE=percent`)
```bash
EXTENSION_ROLLOUT_STAGE=percent
EXTENSION_ROLLOUT_PERCENT=10   # → 25 → 50 → 100
```
**Gate:** each step runs ≥ 48h stable before increasing percent.

---

## Rollback instructions (< 10 minutes)

### Level 1 — Soft rollback (recommended, in-flight safe)
**Time: ~2 min** (env update + rolling restart)

```bash
EXTENSION_ROLLOUT_KILL_SWITCH=true
EXTENSION_ROLLOUT_INFLIGHT_GRACE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=false
```

| Effect | |
|--------|--|
| New orders | Manual flow only (`PATCH /orders/:id/trade-reference`) |
| In-flight extension orders | Extension poll/progress still works |
| Money | No automatic release on ambiguity (unchanged) |

### Level 2 — Stop new extension tasks globally
**Time: ~3 min**

```bash
ENABLE_EXTENSION_TASK_PIPELINE=false
```
Existing tasks remain in DB; sellers complete via manual reference if orchestrator off.

### Level 3 — Nuclear (disable extension API)
**Time: ~5 min** — use only if extension channel compromised

```bash
ENABLE_EXTENSION_CHANNEL=false
EXTENSION_ROLLOUT_KILL_SWITCH=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=false
ENABLE_EXTENSION_TASK_PIPELINE=false
```

All in-flight extension automation stops. Ops completes trades manually via admin + `PATCH /orders/:id/trade-reference`.

### Rollback sequence (step-by-step)
1. **T+0** — Set `EXTENSION_ROLLOUT_KILL_SWITCH=true` in prod env
2. **T+1** — Set `ENABLE_EXTENSION_OFFER_ORCHESTRATOR=false`
3. **T+2** — Rolling restart backend pods / `pm2 reload`
4. **T+3** — Verify `GET /admin/rollout/extension` → `killSwitch: true`
5. **T+5** — Create test order → confirm **no** `TradeTask` row created
6. **T+7** — Pick in-flight `WAITING_TRADE` order → confirm manual trade-reference still works
7. **T+10** — Run smoke checklist below

**Orders are never deleted or cancelled by rollback.** Holds remain until normal settlement/dispute resolution.

---

## Smoke test checklist (post-rollback)

- [ ] `GET /health` → `status: ok`
- [ ] `GET /admin/rollout/extension` → `killSwitch: true`, `stage` unchanged
- [ ] New buy on non-allowlisted lot → order `WAITING_TRADE`, **no** `TradeTask`
- [ ] Manual `PATCH /orders/:id/trade-reference` → accepted (idempotent)
- [ ] Trade poller still transitions `WAITING` → `CONFIRMED` on valid offer
- [ ] In-flight order with existing task → extension poll returns task (if Level 1–2)
- [ ] No new `OPS_ALERT` / `EXTENSION_SECURITY_ALERT` spike (15 min window)
- [ ] Admin dispute timeline loads for open orders
- [ ] Ledger reconciliation `POST /health/reconcile` → `ok: true`

---

## Go-live checklist (final)

### Pre-flight
- [ ] All migrations deployed (`extension_rollout_allowlist`)
- [ ] `ENABLE_EXTENSION_FLOW_OBSERVABILITY=true` on staging
- [ ] Admin dashboard: `/admin/metrics/extension-flow` + `/admin/rollout/extension`
- [ ] On-call runbook link shared with ops
- [ ] Rollback env vars documented in deployment secrets

### Stage gates
- [ ] Internal stage: ≥ 5 successful trades, 0 financial incidents
- [ ] Allowlist stage: KPI thresholds met (see M9 docs)
- [ ] Percent 10%: 48h stable → promote to 25%

### Launch hour
- [ ] Deploy with `EXTENSION_ROLLOUT_STAGE=internal` (not percent on day 1)
- [ ] Monitor `extension_flow_completion_rate_pct` every 15 min
- [ ] Monitor `OPS_ALERT` notifications
- [ ] One ops engineer on rollback authority

### Post-launch (24h)
- [ ] Dispute rate ≤ 15%
- [ ] Task success rate ≥ 85%
- [ ] No manual fund releases outside policy
- [ ] Retrospective: adjust percent or thresholds

---

## Rollout stop criteria (immediate halt)

Stop rollout and execute **Level 1 rollback** if any:

| Signal | Threshold |
|--------|-----------|
| `COMPLETION_RATE_DROP` alert | Fired |
| `DISPUTE_RATE_SPIKE` alert | Fired |
| `VERIFY_MISMATCH_SPIKE` alert | Fired |
| Financial invariant break | Ledger reconciliation `ok: false` |
| Unauthorized money release | Any incident |
| Extension auth anomaly | `EXTENSION_AUTH_ANOMALY` + sustained errors |
| Task failure spike | `TASK_FAILURE_SPIKE` alert |
| Manual ops override rate | > 20% of open trades in 1h |

**Do not** increase `EXTENSION_ROLLOUT_PERCENT` until stop cause is resolved and 24h clean window.

---

## Admin API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/rollout/extension` | Full rollout + flags snapshot |
| GET | `/admin/rollout/extension/allowlist` | List DB + env allowlist |
| POST | `/admin/rollout/extension/allowlist/:steamId` | Upsert seller |
| POST | `/admin/rollout/extension/allowlist/:steamId/delete` | Remove seller |

## In-flight order compatibility

| Order state | Rollback Level 1 | Level 3 |
|-------------|------------------|---------|
| `WAITING_TRADE` + active `TradeTask` | Extension grace ON → task completes | Manual reference only |
| `WAITING_TRADE` no task | Manual reference | Manual reference |
| `TRADE_CONFIRMED` / `SETTLEMENT_HOLD` | Settlement workers unchanged | Settlement workers unchanged |
| `DISPUTE` | Dispute ops unchanged | Dispute ops unchanged |

Idempotency keys on all commands/events are preserved across rollback.
