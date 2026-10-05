# Server-owned Steam receipt authority v3 (0.6.73 candidate)

This document describes local code, not a deployed or live-verified release.

## Authentication and binding

The order supplies the exact offer, seller, buyer and original asset. Both API-key and ephemeral-token paths require outgoing seller perspective, correct counterparty, exactly one app 730/context 2/original asset/amount 1, no unexpected received items, and the exact tradeBinding message when configured. API keys require the configured seller owner; explicit token identity contradictions fail closed. Missing token identity can only be supplemented by the independently read exact outgoing offer. Client ACK, PAGE_OBSERVED, DOM and seller disappearance never authorize delivery or money.

GetTradeStatus is read using the tradeId obtained from the exact offer. The common receipt parser requires the exact tradeId, completed status 3, buyer partner and exact original item, with no rollback fields. Receipt parsing is shared by initial verification and final protection checks. Token lifetime and request scope are unchanged; no token, cookie, API key or credential URL enters the proof or logs.

## BEFORE and receipt persistence

Explicit extension consent and a complete, fresh server BEFORE baseline in contexts 2 and 16 remain mandatory before dispatch. No baseline is reconstructed after sending. Task leases, fencing and dispatch logic are unchanged.

DeliveryWorkflowService CAS-persists proof version 3 immediately after a valid receipt and existing baseline, before any optional public inventory lookup. It stores order/offer/trade/party/original-item anchors, exact tradeBinding (when present), bindingVerified, receiptStatus, offerState, authority STEAM_RECEIPT, verifiedAt and protectionUntil. The existing PostgreSQL immutable-proof trigger prevents replacement/removal. No migration is required.

Valid receipt new_assetid/new_contextid are stored as STEAM_RECEIPT mapping. Missing destination fields are omitted, never fabricated. A public inventory returning zero assets, missing float/seed or an unavailable endpoint cannot block receipt authority. The conservative inventory fingerprint/mapping utilities remain unchanged; inventory observation remains mandatory for BEFORE and useful for anomaly checks before receipt. New receipt proof does not require or infer a delta mapping. Later reconciliation must not rewrite the immutable proof.

## Recovery and compatibility

Every financial consumer validates the proof against the current order, numeric identity anchors, receipt/offer status, binding and at least eight days of protection. Valid complete v2 proofs remain readable without conversion; incomplete or contradictory legacy rows fail closed. v2 with an existing but unverified binding does not gain new authority.

A restart between proof persistence and transition reuses the saved proof even if the old offer becomes unknown or Steam is throttled. No fresh inventory is needed. A different tradeId, changed binding, explicit identity conflict, reversal or contradictory known offer status cannot replace proof and escalates safely. Order/trade transitions still use existing state services, audit and outbox. Transition and hold entry share a transaction; crash rollback leaves a recoverable proof. Duplicate polls do not cause duplicate settlement.

Account mapping leases are released after proof persistence (and on recovery if the first release crashed). This is safe because no new financial decision accepts an inventory delta without its own exact receipt. Unresolved transfers without proof retain their existing quarantine; expired time alone does not authorize reassignment.

## Retry phases

Offer-unknown, inventory-unknown and accepted-without-authority streaks derive from newest consecutive server TradePollEvent rows. PAGE_OBSERVED cannot reset them. The current observation counts toward the corresponding limit; 19 accepted checks followed by one unknown count as one unknown. checkCount remains telemetry/backoff, never exhaustion authority.

Protection retries use only SETTLEMENT_PROTECTION_RECHECK events for that operation. Prior delivery polls consume no protection budget. Failure 20 escalates to MANUAL_REVIEW; explicit reversal escalates immediately. Retry delay is phase-local. Failed reads do not release funds.

## Funds

Every valid new proof enters SETTLEMENT_HOLD even with test balances or disabled release flags. getSteamProtectionMs is the canonical duration, minimum eight days and optionally longer by configuration. Hold deadline equals the saved proof deadline. Existing allowlists, amount/daily limits, ledger locking/idempotency and ENABLE_REAL_SETTLEMENT checks remain.

A due release validates stored proof, then reads GetTradeStatus directly by persisted tradeId, without requiring the old GetTradeOffer. The hybrid provider forwards this path to Steam as well. The fresh receipt must match and contain no reversal. API key ownership must match the seller; a temporary token on this direct path must have an explicit fresh matching identity because there is no fresh outgoing offer to substitute for it. Missing access, malformed data, timeout, 429 or conflicts keep funds held; reversal requires review and no automatic payout/refund.

Consequently unattended release is not guaranteed if the configured key cannot read the historical receipt. Tokens are deliberately not retained for eight days. This is a release availability limitation, not permission to bypass evidence.

## Test-model changes

Old tests asserting accepted + inventory confirmed implies payout now assert no authority without durable receipt. Workflow tests previously requiring destination mapping now assert receipt persistence with empty/unavailable inventory and absent mapping. Fingerprint tests still reject missing float/seed and lookalikes. Guard fixtures now contain complete immutable proofs and exercise direct tradeId reads. Shadow tests still reject client snapshots; only the fixed error text changed.

## Production recovery plan (not executed)

1. Read the affected order, existing BEFORE/binding/offer reference, proof and audit/ledger history without edits.
2. If tradeId was never saved, obtain it only from an exact server-authenticated bound offer or independently verified Steam receipt; never invent it from client UI.
3. Reverify parties, original item, binding, completion and reversal. Missing evidence means the order stays MANUAL_REVIEW and funds stay reserved.
4. Only after separate operator authorization, use an idempotent reviewed recovery operation through the existing state services to persist valid evidence and enter hold, preserving audit/outbox and no immediate payout.
5. Do not reset all review rows, remove mapping quarantine or shorten protection. If Steam no longer exposes the offer and no authoritative tradeId exists, automatic recovery is not established.
