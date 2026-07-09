# Delivery Verification Decision Table (M6)

Feature flag: `ENABLE_DELIVERY_VERIFICATION_ENGINE=true` enables dual-signal verification.

When the engine is **disabled**, legacy single-signal behavior is preserved:
- offer poll only when `externalOfferId` is set
- inventory delta only when offer id is missing

## Dual-signal mode (engine on)

| Offer status | Inventory delta | Action | Reason code |
|--------------|-----------------|--------|-------------|
| `accepted` | `confirmed` | **CONFIRM** → `TRADE_CONFIRMED` | `DUAL_SIGNAL_CONFIRMED` |
| `accepted` | `pending` | WAIT (retry) | `INVENTORY_PENDING` |
| `accepted` | `pending` (exhausted checks) | **DISPUTE** | `DELIVERY_ACCEPTED_INVENTORY_PENDING_EXHAUSTED` |
| `accepted` | `seller_still_holds` | **DISPUTE** | `DELIVERY_INVENTORY_MISMATCH` |
| `accepted` | `unknown` | **DISPUTE** | `DELIVERY_VERIFICATION_UNKNOWN` |
| `pending` | `confirmed` | **DISPUTE** | `DELIVERY_SIGNAL_CONFLICT` |
| `pending` | `pending` / `seller_still_holds` | WAIT | `OFFER_PENDING` |
| `pending` | `unknown` | WAIT | `INVENTORY_UNKNOWN_RETRY` |
| `declined` | * | FAIL (`SAFE` or **DISPUTE**) | `OFFER_DECLINED` |
| `expired` | * | FAIL (`SAFE` or **DISPUTE**) | `OFFER_EXPIRED` |
| `unknown` | * | **DISPUTE** | `OFFER_UNKNOWN` |
| (no offer id) | `confirmed` | **CONFIRM** | `INVENTORY_ONLY_CONFIRMED` |
| (no offer id) | `pending` / `seller_still_holds` | WAIT | `INVENTORY_PENDING` |
| (no offer id) | `unknown` (exhausted checks) | **DISPUTE** | `INVENTORY_UNKNOWN_EXHAUSTED` |

## Global guards

| Condition | Action |
|-----------|--------|
| Trade window elapsed (`TRADE_TIMEOUT_MINUTES`) | **TIMEOUT** → order `DISPUTE` |
| Steam API 429 | **BACKOFF** (exponential, no state transition) |
| Shadow mode (`verificationMode=SHADOW`) | Record snapshot only, no live transition |

## Settlement

`DELIVERY_VERIFIED` / settlement is only reached via `CONFIRM` decisions.
Ambiguous or conflicting signals never release funds.
