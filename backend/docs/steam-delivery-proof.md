# Server-owned Steam delivery workflow v2

This is a local release candidate, not a statement that the deployed service is fixed. Production remains at the operator's last deployed release until explicit manual activation. See the delivery completion report for actual validation limits.

## Authority and authentication

The stored order supplies seller, buyer, original asset and offer ID. Browser acknowledgements, inventory DOM and cookie SteamID prefixes never authorize money. A temporary seller token is scoped to one request/order/offer using AsyncLocalStorage, used over HTTPS only for Steam reads, and cleared in finally. The extension stores only a 30-minute consent record in session storage; it does not store the Steam token. Signed preflight runs before cookie access. Stopping permission prevents future reads/sends but cannot recall an already submitted HTTP request.

GetTokenDetails is an additional identity signal. Explicit missing/invalid/conflicting identity fields fail closed when present; an entirely absent identity signal can be supplemented by the exact authenticated outgoing offer, expected buyer and original asset. HTTP 200 alone has no authority. The global API key still requires operator-verified STEAM_WEB_API_KEY_OWNER_STEAM_ID; changing that setting cannot give the key access to other sellers.

## Receipt is separate from mapping

The provider validates exact offer ID, seller perspective, partner account, exactly one given app 730/context 2/original asset/amount 1, no requested items, and numeric accepted state. The historical offer item's missing flag is permitted only after acceptance. The server obtains tradeid from that offer, then validates an exact completed receipt (status 3), partner, original asset/amount and no rollback metadata.

receiptVerified does not require new_assetid or new_contextid. A valid destination ID in context 2 or 16 provides preferred STEAM_RECEIPT mapping. Otherwise the workflow attempts INVENTORY_DELTA. ETradeStatus 10 (InEscrow) is not a reversal; 11 (EscrowRollback), statuses 4–9 and rollback asset fields block release. Offer state numbers are a different enumeration. Reference: https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/resources/ETradeStatus.js .

## Before sending

The seller authorizes the current order in extension 0.6.70. Backend preflight acquires durable mapping leases for BOTH Steam accounts in sorted order, reads complete fresh server inventories in contexts 2 and 16, and persists the original seller item plus both snapshots. Only then is the CREATE_OFFER task dispatched. A UUID p2pcs: message binds the offer as an additional signal; it never substitutes for participant/asset/receipt validation. No baseline is manufactured after sendStartedAt or externalOfferId exists.

A baseline older than 30 minutes without an attached offer requires manual review. An incomplete/blocked context does not become an empty inventory. Preparation retries after 120–150 seconds. Existing unresolved orders without a baseline cannot use delta mapping; authoritative receipt mapping can still work.

## Destination verification

Observations preserve asset/context/app/class/instance/name/float/seed/stickers. Both contexts and every page must be complete. Seller original disappearance and buyer destination presence are required. Delta candidates must be absent from the buyer's combined BEFORE inventory and match app/class/instance/name plus valid exact float, seed and stickers. Name or float alone never suffices. Movement of a pre-existing ID between contexts is not a gain.

Zero candidates means retry; multiple candidates mean MANUAL_REVIEW. Missing float/seed prevents the conservative delta fallback. This is deliberate: the implementation does not invent metadata or assume every Steam inventory response supplies it. Authoritative receipt mapping can operate without that fingerprint.

After exact receipt + unique mapping the server CAS-persists deliveryProof v2 with parties, original and destination IDs/context, offer/trade IDs, method, verification time and protectionUntil. A PostgreSQL trigger forbids replacing or clearing a non-null proof. No credential is included. Account leases are released only after proof persistence; a restarted worker can recover from the saved proof without reconstructing the original delta.

## Durable state and retries

TradeOperation.verificationStage supplements existing enums: WAITING_FOR_STEAM, OFFER_CREATED, OFFER_ACCEPTED, RECEIPT_VERIFIED, DELIVERY_VERIFIED, PROTECTION_RECHECK, MANUAL_REVIEW. Existing order/trade state machines retain their guarded delivery/hold/completed transitions.

Polling uses persisted nextVerificationAt, checkCount and a five-minute lease with a random fencing token. Normal claims recheck due time in the database. Forced authenticated receipt checks may bypass delay, but cannot bypass the lease, manual review or financial checks. Backoff is exponential with jitter and a 15-minute cap. Technical exhaustion uses MANUAL_REVIEW, keeps the original hold, and does not accuse either participant of a dispute. Actual contradictory delivery/reversal evidence can use DISPUTE. SAFE failure mode cannot refund contradictory evidence.

Mapping leases have a 30-minute deadline but an expired unresolved transfer is quarantined, not reassigned to another order. Time alone does not prove that an offer was never sent. Terminal mapped orders and orders canceled before sending are eligible for safe cleanup. Support must resolve uncertainty before allowing another mapping window; do not delete leases or reset states merely to force a payout.

## Funds and recovery

Every new real delivery proof enters SETTLEMENT_HOLD, including test balances and disabled payout/hold flags. Hold duration is at least eight days from verification/entry. ENABLE_REAL_SETTLEMENT=false pauses release; this change does not enable it. Existing allowlists/limits continue to apply.

Release rereads the exact Steam offer and receipt, compares the immutable proof, checks elapsed protection and reversal, then uses existing guarded ledger/idempotency transitions. Repeating a worker cannot authorize a second ledger settlement. Missing fresh Steam access leaves money held with bounded retry/manual review. No automatic refund is inferred from rollback metadata alone.

Tokens are intentionally not saved for eight days. Automatic release requires the configured server credential to read the trade at release time. A fresh explicitly consented seller request can also invoke the normal held-order release path. If neither source is available, unattended release is not guaranteed and remains blocked; do not weaken that boundary to make a test green.

## Compatibility and rollout

The additive migration 20260929180000_delivery_workflow adds workflow columns, SteamMappingLease and an immutable-proof trigger inside a transaction. It changes no existing order outcome, wallet balance, flag, key or secret. Old disputes stay read-only. The historic control regression uses its IDs with synthetic before/after observations; it is not a reconstruction of the real missing BEFORE snapshot.

Generate a fresh Prisma client in an isolated build. Never regenerate the live client's node_modules during staging. Existing simple release scripts that forbid schema/shared-extension changes are unsuitable for this candidate. Use the separately prepared migration-aware handoff only after all blocked local checks pass. Application rollback keeps this additive schema; database restoration is a separate operator decision.

Unit/type checks are not a substitute for PostgreSQL migration/concurrency tests, Vite/extension tests, artifact inspection or the final consented Steam trade. Do not advertise this candidate as production-ready until those gates pass.
