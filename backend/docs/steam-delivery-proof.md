# Order-bound Steam delivery proof

The live and hybrid trade providers receive the expected seller, buyer and original CS2 asset from the stored order, not an extension payload. A bare accepted offer is no longer delivery evidence.

For the existing API-key adapter, `STEAM_WEB_API_KEY_OWNER_STEAM_ID` must explicitly identify the verified owner of `STEAM_WEB_API_KEY`. Missing or mismatched ownership fails closed. This is operator-managed credential metadata, not an automatic way to establish key ownership. Do not set it to each incoming seller or assume a marketplace-wide key can read every participant's trades. No environment values are changed by this patch.

The adapter requires an outgoing offer to the expected buyer, exactly one unit of the listed asset in app 730/context 2, and no requested items. For an accepted offer (numeric state 3), the original item being marked `missing` does not invalidate that identity binding. Missing items in other states still fail the check. This exception does not apply to receipt items and does not prove delivery. The adapter obtains the trade ID from that server response, then reads GetTradeStatus and validates the exact receipt, counterparty and original item. Only a complete receipt with a nonzero string destination asset ID in context 2 and no rollback metadata produces a destination mapping.

The inventory verifier still fetches fresh, complete observations independently. It checks the seller's original asset has disappeared and the buyer's mapped asset is present. Failed, partial or stale inventories do not confirm delivery. Names, floats and client acknowledgements cannot substitute for the mapping.

Protected context 16, missing mappings, escrow, rollback and inaccessible API responses remain unverified. This conservative path does NOT implement settlement during trade protection or solve participant authentication. It must not be advertised as a complete Steam integration. On 2026-09-28 the user's consented access-token diagnostic returned the exact accepted outgoing offer and complete receipt, with matching partner and original item. The offer item was marked missing; the receipt omitted destination asset/context fields. The production API-key adapter is a separate authentication path and this diagnostic does not establish its visibility.

Do not retry indefinitely expecting destination fields to appear, infer context 2 from an absent field, or use name/float/seed matching as an authoritative mapping. Missing destination fields are also reported by CS2 integrators after the protection period: https://dev.doctormckay.com/topic/5934-new_assetid-from-getexchangedetails-is-undefined/ . These reports support investigating an API behavior change, not a guarantee about every trade. A new production proof design must explicitly address participant authentication, unavailable mappings and reversal verification before any financial rollout.

Credential transport has not been added. Authenticated Steam requests reject redirects. Network exception text is not logged by TradesService, since it can contain credentials. Existing rate-limit exceptions still reach delivery backoff.

References for the exchange-details response and statuses:
- https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/lib/classes/TradeOffer.js
- https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/resources/ETradeStatus.js

Rollout remains blocked on verifying real authenticated responses, protection/reversal handling, and a new end-to-end trade. Existing financial flags and secrets must remain unchanged during this validation.

## Held settlement recheck

Before releasing a SETTLEMENT_HOLD, SettlementGuardService rereads the stored offer ID and expected original asset and requests fresh order-bound verification from the trade provider. Unknown, reversed/incomplete, inaccessible or unmapped exchanges block release with STEAM_RECHECK_UNAVAILABLE. Transport error text is not exposed or persisted. The common guard protects both automatic release and retry paths. A previously settled ledger entry retains its existing idempotency behavior.

This is a conservative release gate, not automatic reversal classification or a solution to missing destination mappings. The current Steam adapter returns unknown for rollback and unavailable proof, so these holds require retry or review rather than automatic refund. Authentication and receipt-mapping limitations still block the observed live exchange. No financial flags or live hold durations are changed.
