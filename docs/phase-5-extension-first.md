# Phase 5 — Extension-first trade flow

**Module:** 5 (M1–M10)  
**Status:** Closed (code + automated tests)  
**Staging gate:** Internal rollout → allowlist → percent; completion ≥ 70%, task success ≥ 85%, dispute rate ≤ 15%

---

## Overview

Phase 5 replaces manual trade-reference PATCH with an **extension-first** pipeline: the seller's Chrome extension receives `TradeTask` commands, automates Steam trade offer creation, reports execution phases, and the backend reconciles `offerId`, verifies delivery with dual signals, holds settlement for 8 days, and routes disputes through unified ops tooling.

```
Buyer purchase → TradeTask created → Extension poll/execute
      → offerId reconcile → delivery verification → SETTLEMENT_HOLD → release worker → COMPLETED
```

All features are behind feature flags (default **off**). See [extension rollout runbook](../backend/docs/extension-rollout-runbook.md).

---

## Milestones

| Milestone | Scope | Key paths |
|-----------|-------|-----------|
| **M1** | Extension channel — device pairing, signed envelopes, session guard | `backend/src/extension/` |
| **M2** | Trade task pipeline — `TradeTask` on buy, poll, progress reporting | `extension-trade-task.service.ts` |
| **M3** | Offer orchestrator — execution phases, error codes | `extension-offer-orchestrator.config.ts` |
| **M4** | Trade reference reconcile — `offerId` → `TradeOperation` | `trade-reference-reconcile.service.ts` |
| **M5** | Browser extension — MV3 service worker, UI trade flow | `browser-extension/`, `extension/` |
| **M6** | Delivery verification engine — dual-signal (offer + inventory) | [decision table](../backend/docs/delivery-verification-decision-table.md) |
| **M7** | Settlement hold window — 8-day hold before seller payout | [hold window](../backend/docs/settlement-hold-window.md) |
| **M8** | Dispute ops bridge — auto-dispute, admin timeline, hold reversal | [dispute runbook](../backend/docs/dispute-support-runbook.md) |
| **M9** | Flow observability — metrics, alerts, anti-fraud | [observability](../backend/docs/extension-flow-observability.md) |
| **M10** | Staged rollout — internal / allowlist / percent + kill switch | [rollout runbook](../backend/docs/extension-rollout-runbook.md) |

---

## Database (Prisma migrations)

| Migration | Change |
|-----------|--------|
| `20260707130500_extension_first_state_machine` | Order states: `DELIVERY_VERIFIED`, `SETTLEMENT_HOLD`; `TradeTask`, extension models |
| `20260707131500_extension_channel_security` | `ExtensionDevice`, `ExtensionSession`, `ExtensionNonce`, `ExtensionCommandAck` |
| `20260707132500_trade_task_pipeline` | `TradeTask` indexes, status events |
| `20260707133500_trade_task_execution_phase` | `TradeTaskExecutionPhase` enum + phase events |
| `20260707134500_trade_operation_offer_unique` | Unique `externalOfferId` on `TradeOperation` |
| `20260707135500_settlement_hold_window` | `settlementHoldUntil` on `Hold`, release audit fields |
| `20260707141500_extension_rollout_allowlist` | `ExtensionRolloutAllowlistEntry` |
| `20260707200000_user_steam_persona_name` | `User.steamPersonaName` |
| `20260708193000_trade_task_ui_phases` | UI trade execution phases |

---

## Feature flags (summary)

See `backend/.env.example` for full list. Minimum for internal stage:

```env
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_ROLLOUT=true
EXTENSION_ROLLOUT_STAGE=internal
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
ENABLE_EXTENSION_UI_TRADE_FLOW=true
ENABLE_TRADE_REFERENCE_RECONCILE=true
ENABLE_EXTENSION_FIRST_TRADE_FLOW=true
ENABLE_DELIVERY_VERIFICATION_ENGINE=true
ENABLE_SETTLEMENT_HOLD_WINDOW=true
ENABLE_EXTENSION_DISPUTE_BRIDGE=true
ENABLE_EXTENSION_FLOW_OBSERVABILITY=true
```

Kill switch: `EXTENSION_ROLLOUT_KILL_SWITCH=true` stops new extension tasks; in-flight orders respect `EXTENSION_ROLLOUT_INFLIGHT_GRACE`.

---

## Order state machine (extension path)

```
WAITING_TRADE → TRADE_SENT → TRADE_CONFIRMED → DELIVERY_VERIFIED → SETTLEMENT_HOLD → COMPLETED
                     ↓              ↓                    ↓
                  DISPUTE        DISPUTE              DISPUTE
```

Legacy Phase 4 poll path remains when extension flags are off.

---

## Browser extension

- **Package:** `browser-extension/` (Chrome MV3, load `dist/`)
- **Shared lib:** `extension/` (`@rip-market/extension-orchestrator`)
- **Pairing:** Account page → extension handshake → poll tasks every ~15s
- **Trade modes:** UI autofill (default when `ENABLE_EXTENSION_UI_TRADE_FLOW=true`) or legacy API POST

Full build/pairing/QA guide: [browser-extension.md](./browser-extension.md).

---

## Frontend changes

- `ExtensionConnectPanel` — pair extension from Account page
- `ExtensionTaskProgress` — live phase display on seller order page
- Order flow utils updated for `DELIVERY_VERIFIED`, `SETTLEMENT_HOLD`
- `VITE_EXTENSION_ID` in `frontend/.env` for `externally_connectable` messaging

---

## Admin / ops

- `GET /admin/orders/:id/timeline` — unified order timeline
- `POST /admin/orders/:id/reverse-settlement-hold` — pre-release hold reversal
- `GET /admin/metrics/extension-flow` — KPI dashboard (when observability on)
- Extension rollout allowlist: `POST /admin/rollout/extension/allowlist/:steamId`

---

## Tests

```bash
# Backend unit + e2e
cd backend && npm test && npm run test:e2e -- --testPathPattern="extension|trade-reference|delivery"

# Extension packages
cd extension && npm test
cd ../browser-extension && npm test

# Frontend Playwright
cd frontend && npx playwright test e2e/extension-task-phase-progression.spec.ts
```

E2E specs: `extension-channel`, `extension-first-state-machine`, `extension-task-pipeline`, `trade-reference-reconcile`.

---

## Rollback

1. Set `EXTENSION_ROLLOUT_KILL_SWITCH=true` (< 1 min)
2. Disable `ENABLE_EXTENSION_TASK_PIPELINE` (< 5 min)
3. Sellers fall back to manual trade-reference PATCH (Phase 4 path)

Details: [extension-rollout-runbook.md](../backend/docs/extension-rollout-runbook.md#rollback-instructions--10-minutes).

---

## Related docs

- [Browser extension (Stage 1)](./browser-extension.md)
- [Extension rollout runbook](../backend/docs/extension-rollout-runbook.md)
- [Delivery verification decision table](../backend/docs/delivery-verification-decision-table.md)
- [Settlement hold window](../backend/docs/settlement-hold-window.md)
- [Dispute support runbook](../backend/docs/dispute-support-runbook.md)
- [Extension flow observability](../backend/docs/extension-flow-observability.md)
- [QA staging — p2pcs.ru](./QA-STAGING-p2pcs.md)
