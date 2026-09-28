# Order-bound Steam delivery proof

The live and hybrid trade providers receive the expected seller, buyer and original CS2 asset from the stored order, not an extension payload. A bare accepted offer is no longer delivery evidence.

For the existing API-key adapter, `STEAM_WEB_API_KEY_OWNER_STEAM_ID` must explicitly identify the verified owner of `STEAM_WEB_API_KEY`. Missing or mismatched ownership fails closed. This is operator-managed credential metadata, not an automatic way to establish key ownership. Do not set it to each incoming seller or assume a marketplace-wide key can read every participant's trades. No environment values are changed by this patch.

The adapter requires an outgoing offer to the expected buyer, exactly one unit of the listed asset in app 730/context 2, and no requested items. It obtains the trade ID from that server response, then reads GetTradeStatus and validates the exact receipt, counterparty and original item. Only a complete receipt with a nonzero string destination asset ID in context 2 and no rollback metadata produces a destination mapping.

The inventory verifier still fetches fresh, complete observations independently. It checks the seller's original asset has disappeared and the buyer's mapped asset is present. Failed, partial or stale inventories do not confirm delivery. Names, floats and client acknowledgements cannot substitute for the mapping.

Protected context 16, missing mappings, escrow, rollback and inaccessible API responses remain unverified. This conservative path does NOT implement settlement during trade protection or solve participant authentication. It must not be advertised as a complete Steam integration. The live API currently returns empty responses even for a confirmed older seller offer; successful fixtures do not resolve that external issue.

Credential transport has not been added. Authenticated Steam requests reject redirects. Network exception text is not logged by TradesService, since it can contain credentials. Existing rate-limit exceptions still reach delivery backoff.

References for the exchange-details response and statuses:
- https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/lib/classes/TradeOffer.js
- https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/blob/master/resources/ETradeStatus.js

Rollout remains blocked on verifying real authenticated responses, protection/reversal handling, and a new end-to-end trade. Existing financial flags and secrets must remain unchanged during this validation.
