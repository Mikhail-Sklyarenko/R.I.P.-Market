# P2PCS MVP hardening — 2026-09-27

Status: **MVP NOT FULLY READY**. This is an in-progress evidence log, not a release certificate.
Base: `4238e11d99f35263ea10291603d0a6b4b06e6de1`; branch `codex-mvp-hardening`; rollback reference `pre-codex-mvp`.

## Verified fixes

| ID | Severity / area | Reproduction / root cause | Fix | Evidence / state |
|---|---|---|---|---|
| H01 | Critical / settlement | Buyer receipt, unknown Steam status, inventory lag and retry exhaustion could return CONFIRM. 34 of 140 authority combinations reproduced unsafe confirmation. | Only accepted offer AND confirmed inventory permit poll settlement, including legacy flag settings. | 140-case matrix + PostgreSQL receipt/dual-signal replay; REGRESSION VERIFIED |
| H02 | Critical / client evidence | A client page-observed accepted state could promote server unknown to accepted. | DOM evidence no longer participates in authoritative delivery decision. | Engine regression; REGRESSION VERIFIED |
| H03 | Critical / admin | Applying accepted shadow snapshot bypassed inventory proof and credited ledger. | Reject single-signal admin application; settlement entrypoint checks evidence before DB access. | API test verifies unchanged WAITING_TRADE, no settlement or successful audit; 4 entrypoint tests; REGRESSION VERIFIED |
| H04 | High / refund | Disputed lot was already BLOCKED; refund attempted illegal BLOCKED -> BLOCKED and rolled back. | Preserve BLOCKED and clear reservation without duplicate transition. | Buyer dispute API + repeated idempotency key + refunded balance; REGRESSION VERIFIED |
| H05 | Critical / auth | Real payment provider configuration could permit mock login outside production. | Shared fail-closed predicate for auth config and service. | crypto_tron and north reject before identity mutation/signing; REGRESSION VERIFIED |
| H06 | High / inventory | Reserved DB rows are not live inventory evidence; partial sync could infer absence. | Real provider returns observed IDs from fresh fetch. Require complete fresh snapshots; partial/missing observations are unknown. | 5 live snapshot tests, existing mismatch/identity-switch tests; REGRESSION VERIFIED |
| H07 | Medium / frontend | ESLint failures in purchase controls and safe return-path validation. | Equivalent boolean conditions and explicit control-character validation. | 277 frontend unit tests, lint no errors; REGRESSION VERIFIED |
| H08 | Medium / extension CI | Shared signing spec excluded; frontend packaging expected browser extension dist absent on clean checkout. | Include .spec.ts; CI installs/tests/builds shared and browser extension first. | Shared 28 tests pass; clean CI browser build not yet observed; FIXED |
| H09 | High / test isolation | UI E2E selected live crypto provider with destructive reset routes; startup rightly refused. | Explicit e2e_crypto option requires NODE_ENV=test, HOST=127.0.0.1, test routes and local p2pcs_e2e DB. Real provider reset prohibition preserved. | 8 configuration regressions; local test API startup and database connectivity verified; VERIFIED |
| H10 | Medium / quality | Backend lint failed with 416 errors before normalization. | Existing eslint --fix script; typed Map iterator and unused catch binding fixed. | Backend lint and build pass; VERIFIED |

## Verification boundaries

Local PostgreSQL 16.15 listens only on 127.0.0.1:55432. Both disposable databases p2pcs_e2e and rip_audit_backend have all 38 migrations. Credentials are outside the repository and are not published. Interrupted migration databases were preserved under renamed local names.

Backend: 109 unit suites / 618 tests pass. API: 17 suites / 62 tests pass after test harness changes. PostgreSQL security suite: 17 checks pass, including double-spend, withdrawal quota race, rollback/retry webhook, stale transitions, two devices/one lease, late offer evidence, receipt rejection and single settlement. Frontend: 277 tests pass. Shared extension: 28 tests pass. Crypto gateway: 16 tests pass.

Browser-extension Vite6 tests/build and frontend Vite build remain blocked by Windows subprocess EPERM. TypeScript checks passed. UI Playwright has not passed. Test numbers do not certify real Steam transfer.

## Financial transition rules

Purchase reserves AVAILABLE -> HOLD atomically with order/lot reservation. WAITING_TRADE remains waiting for insufficient evidence; contradictory/exhausted evidence escalates to DISPUTE and does not pay. Only server accepted + inventory confirmed reaches TRADE_CONFIRMED, then SETTLEMENT_HOLD or COMPLETED according to settlement rules. Repeated completion cannot double-credit. Buyer dispute refund ends FAILED and leaves lot BLOCKED; it does not auto-relist. Explicit manual dispute adjudication is separate from poll verification.

Extension task ownership/leaseVersion must be obtained by poll before progress reports. Late OFFER_SENT can reconcile the canonical offer after confirmation; a different second reference cannot replace it. A client receipt is evidence of user action, never financial authorization.

## Real environment observations

Public p2pcs.ru health/database/gateway responded. Public configuration reports Steam auth/inventory, mock/hybrid trade, crypto_tron payments, live verification and real settlement flag off. User explicitly confirmed funds on this site are test funds. Download manifest and source manifest report extension 0.6.62. Download manifest is not proof of the installed extension version or exact deployed commit.

Two Edge profiles are now connected: seller R1ppeR and buyer p2ptradecs. User manually credited $1,000 test funds to the buyer. A real Steam item transfer and the deployed marketplace settlement completed on 2026-09-27; see the reproducible evidence below. This was not an unattended happy path and did not exercise the local hardening branch.

## Unfinished release gates

No deployment or push completed. Git dry-run push fails: credential helper shell signal-pipe Access denied and no available username credential. No tokens were requested in chat.

Real seller -> buyer -> Guard -> accept -> buyer receipt -> deployed settlement ran with manual fallback. Independent server-authority verification of that completion has NOT been established; the deployed buyer receipt completed the order after the item was genuinely received. Current exact-asset delta intentionally stays pending when Steam changes asset ID: authoritative transfer mapping and expected offer/partner/asset binding still require implementation and real API evidence. No name/float/receipt fallback may be restored to make a test green.

Docker Desktop installed but engine needs Windows virtualization features/reboot. Native local PostgreSQL allowed database tests to proceed independently.

## UI E2E setup

Use disposable `p2pcs_e2e` DB for backend E2E and frontend Playwright. Backend setup refuses other database names or remote hosts before destructive resets. `PAYMENT_PROVIDER=e2e_crypto` is only an in-memory test gateway selection; the public API contract remains crypto_tron. Do not use that setting on a remotely accessible server or production database. Production entrypoint safety gates remain enforced.

## Rollback

Nothing was deployed. Keep existing deployed release until release gates pass. For a later rollback use reviewed revert commits or a versioned deployment of the known-good artifact; do not reset shared work or force-push. Do not roll back database/ledger rows by deleting evidence.


## 2026-09-27 two-account live smoke test and follow-up fixes

- Order: 894f7781-c49b-42a5-8a78-8c05f964db2d; lot: 3dcd5d50-6729-4ff6-8c12-64c72c7560ea.
- Seller R1ppeR (76561198195181115) -> buyer p2ptradecs (76561198655632881).
- UMP-45 | Green Swirl (Battle-Scarred), $1.00 test balance; actual Steam offer 9391832342; receipt trade 744938690018752002.
- Seller asset 50586823960, context 2 -> buyer asset 53954582039, context 16. The buyer inventory visibly showed wear 0.661949813, paint seed 397 and Steam protection until 2026-10-04 22:00 Moscow. This observation proves why original-asset exact matching cannot establish delivery after transfer, but is not itself server-authoritative mapping.
- Auto-send exhausted 5 attempts: initial null.hide error, then send interceptor timeout. After selecting the CS2 inventory, extension placed the expected asset. Agent used the standard Steam readiness/gift/send controls; user confirmed Steam Guard. The sent offer ID was saved through the seller order UI.
- Buyer extension shield matched the expected Steam partner and original asset ID. Its double-confirm action acknowledged pre-accept but did not itself accept. Agent then used Steam's readiness and Accept controls; Steam receipt and buyer inventory confirmed receipt.
- Site initially remained WAITING_TRADE. After truthful buyer receipt acknowledgement, the deployed order became COMPLETED at 21:26:55 Moscow. This is a fallback success, not proof of independent verification or the fixed authority implementation.
- Buyer available $1000.00 -> $999.00; HOLD $0.00 after fresh load. Seller available $2034.85 -> $2035.80; single seller payout +$0.95 associated with this order. Marketplace receipt shows $0.05 fee. Platform account DB entry was not independently inspected.
- No real crypto payment, signer operation, withdrawal, manual order completion, or admin dispute override was used. Test credit was performed by the user and appeared as MANUAL_ADJUSTMENT.

Local follow-up changes (not deployed):
1. Trade UI distinguishes #you_notready readiness from #trade_confirmbtn submission, handles the specific gift confirmation for the validated one-way order, rechecks composition, and sends once. Failed preparation cancels the interceptor. Already-selected assets are not toggled out during retries; loaded inventory is not needlessly reselected.
2. Wallet refreshes on entry and when order status changes, preventing stale hold/transaction display after in-app completion.
3. Settlement capture is labelled payment from hold using existing ledger metadata; no ledger data or financial semantics changed.
4. Restored Russian buyer receipt heading and corrected stale Steam-price translation namespace.

Validation: frontend 278 unit tests pass with Node test isolation disabled (ordinary test-worker spawn is restricted). Frontend typecheck passes; lint 0 errors / 14 existing warnings. Browser extension typecheck passes. Seven source-executing jsdom regressions pass for readiness/gift/send order, one send only, changed composition refusal, readiness timeout, disabled send refusal, interceptor cleanup, repeat item selection and complete intercepted autofill (several assertions share a check). Vitest regressions were added but the normal runner is blocked before collecting tests by Vite/esbuild Windows spawn EPERM. No updated extension has been installed or live-tested. UI fixes are locally verified, not deployed.

The completed order also rendered the historical hold amount as current hold. Its COMPLETED summary now shows zero; wallet remains the authoritative aggregate. Typecheck and targeted lint passed after this change. New changes remain uncommitted: Git index.lock creation was denied even after a .git write grant. Full uncommitted patch is preserved in outputs/hardening-evidence/post-live-e2e-fixes.patch.
