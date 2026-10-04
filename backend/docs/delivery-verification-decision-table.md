# Delivery decision table (receipt authority v3)

| Server evidence | Decision |
| --- | --- |
| Valid immutable bound receipt, inventory empty/unavailable, old offer unknown | CONFIRM delivery into SETTLEMENT_HOLD, no payout |
| Explicit reversal | DISPUTE / protected review, no payout |
| Identity/binding/tradeId contradiction | MANUAL_REVIEW, immutable proof unchanged |
| Accepted offer and inventory gain without persisted receipt | WAIT, then bounded MANUAL_REVIEW |
| Buyer ACK or PAGE_OBSERVED only | No financial authority |
| Consecutive server unknown responses reach their own configured limit | MANUAL_REVIEW, funds stay reserved |
| Previous accepted responses followed by one unknown | First unknown retry, not lifetime exhaustion |
| 429 before receipt | BACKOFF; timeout escalates to review |
| Missing offer / incomplete BEFORE | No dispatch or financial confirmation |
| Shadow mode | Snapshot only, no financial transition |
| Due hold, matching fresh GetTradeStatus, all financial guards pass | Existing idempotent settlement release |
| Due hold, fresh Steam data unavailable | Phase-local retry/backoff, then MANUAL_REVIEW; no payout |

Inventory mismatch remains an anomaly signal before authoritative receipt. Exact receipt is not represented as a fictional confirmed inventory delta. Receipt and inventory evidence are separate.
