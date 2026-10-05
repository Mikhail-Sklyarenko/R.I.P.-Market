# Risk-managed automatic settlement 0.6.74

This is risk-managed settlement, not proof that Steam can never reverse a trade.
An immutable server-authenticated v3 Steam receipt and its protection window are
the financial evidence. Optional observations may reveal contradictions; missing
observations do not establish either delivery or reversal.

## Configuration

- `ENABLE_REAL_SETTLEMENT=true` is required; the default remains off.
- `SETTLEMENT_RELEASE_POLICY=proof_window` explicitly selects this policy.
  Unset values preserve the older strict recheck policy.
- `SETTLEMENT_ROLLOUT_MODE=open` removes individual allowlists. Unset/restricted
  mode preserves them. Neither mode bypasses financial checks or risk budgets.
- `AUTO_SETTLEMENT_MAX_ORDER_MINOR` and `AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR`
  must be explicitly configured as positive integer minor-unit amounts. Missing
  or malformed values disable automatic proof-window payments. There is no
  currency-specific default for these budgets.
- Exposure conservatively counts all unpaid SETTLEMENT_HOLD and DISPUTE orders,
  including holds not yet due. Exceeding it leaves funds held. Existing daily
  volume/order limits also remain effective.

No production settings are changed by this release work.

## Authority and observations

Only a bound v3 STEAM_RECEIPT proof may use proof-window settlement. Legacy v2
still requires a fresh receipt check. Receipt status, offer status, binding,
identity, financial consistency, review state and the immutable UTC deadline
are checked before release. The auxiliary Hold timestamp cannot shorten the
protection window. No buyer acknowledgment, browser credential or reopened
extension is required after delivery for this financial path.

A server interval tries receipt and full seller/buyer inventory observations.
Positive reversal/identity signals or strong seller item reappearance produce
MANUAL_REVIEW. Item name alone is insufficient. Transport text is not stored.
Unavailable observations are recorded without changing deliveryProof. Unique
buyer delta mapping is stored separately in TradeVerificationSnapshot and never
overwrites deliveryProof. GetTradeHistory is not a required dependency.

Optional observation transactions and release transactions share a database
advisory lock and order lock. Release uses a canonical ledger idempotency key.
Real PostgreSQL concurrent execution, rollback and lease-cleanup tests are
mandatory release gates; mocked tests do not prove these guarantees.

## Operational limitations

An unobserved reversal remains a financial risk accepted by this policy. Hidden
inventories, insufficient fingerprint metadata and unavailable Steam receipts
can prevent detection. Risk budgets limit exposure; they do not eliminate risk.
The initial exposure calculation deliberately overestimates exposure and may
pause all automatic releases during a large held backlog. Review the configured
budget rather than bypassing proof checks.

No database migration is introduced. Existing cache timestamps are not rewritten.
Old proof-less confirmed orders no longer enter an immediate automatic payout
path. They require explicit review. Local validation must finish before deploying.

## Candidate validation in GitHub Actions

Pushes to `codex-mvp-hardening`, main/master pushes, pull requests and manual
dispatch run CI. `test:settlement:db` explicitly runs the real PostgreSQL suite
in UTC and Europe/Moscow after migrations. Steam receipt/offer calls in that
suite are deterministic mocks; money, locks and ledger operations use PostgreSQL.
The injected failure test proves transaction rollback, not an operating-system
process kill. Repeated entry-point calls model a restart without relying on any
in-memory settlement state.

All browser-extension Vitest tests (including UX tests), orchestrator tests,
frontend tests/build and Playwright run before the final candidate gate.
`scripts/verify-release-0674.py` checks the artifacts. The uploaded ZIP remains a
candidate until backend, frontend and UI E2E jobs all succeed. No CI job deploys.

The existing `tsconfig.build.json` excludes test files; production builds use
that configuration. Jest uses ts-jest with the existing isolatedModules setting.
A separate broad `tsc -p tsconfig.json` currently reports older test mock typing
errors outside this release (Prisma delegates, Response types, narrowed fixture
types). The stale AdminService constructor was fixed. No test exclusions,
skipLibCheck changes or ts-ignore suppressions were introduced to hide errors.
