import type { TradeVerificationContext } from './trade-provider.interface';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const individualSteamId = (value: unknown): value is string =>
  id(value) &&
  BigInt(value) > 76561197960265728n &&
  BigInt(value) <= 76561202255233023n;

export function steamOfferMatchesOrder(
  value: unknown,
  context: TradeVerificationContext,
  credentialOwner: string | undefined,
): boolean {
  const offer = record(value);
  if (
    !offer ||
    !context.sellerSteamId ||
    !context.buyerSteamId ||
    !individualSteamId(context.sellerSteamId) ||
    !individualSteamId(context.buyerSteamId) ||
    context.sellerSteamId === context.buyerSteamId ||
    !id(context.assetId)
  )
    return false;
  // A configured key is NOT automatically a credential for every seller.
  if (credentialOwner !== context.sellerSteamId) return false;
  const buyerAccountId = BigInt(context.buyerSteamId) - 76561197960265728n;
  if (
    buyerAccountId <= 0n ||
    buyerAccountId > 4294967295n ||
    offer.is_our_offer !== true ||
    offer.accountid_other !== Number(buyerAccountId)
  )
    return false;
  const given = offer.items_to_give;
  const received = offer.items_to_receive;
  if (
    !Array.isArray(given) ||
    given.length !== 1 ||
    (received !== undefined &&
      (!Array.isArray(received) || received.length !== 0))
  )
    return false;
  // Accepted offers describe the original asset, which may no longer be in
  // the sender's inventory. `missing` is not an identity mismatch in that
  // historical record. This only binds the offer; receipt mapping and fresh
  // inventories still independently determine delivery.
  return matchesItem(given[0], context.assetId, offer.trade_offer_state === 3);
}

function matchesItem(
  value: unknown,
  assetId: string,
  allowHistoricalMissing = false,
): boolean {
  const item = record(value);
  return (
    !!item &&
    item.appid === 730 &&
    item.contextid === '2' &&
    item.assetid === assetId &&
    item.amount === '1' &&
    (item.missing !== true || allowHistoricalMissing)
  );
}

/** No name/float matching, numeric uint64 coercion, protected context or rollback fallback. */
export function receivedAssetFromSteamReceipt(
  value: unknown,
  tradeId: string,
  context: TradeVerificationContext,
): string | null {
  const receipt = record(value);
  if (
    !receipt ||
    !id(tradeId) ||
    receipt.tradeid !== tradeId ||
    receipt.status !== 3 ||
    receipt.steamid_other !== context.buyerSteamId
  )
    return null;
  const given = receipt.assets_given;
  const received = receipt.assets_received;
  if (
    !Array.isArray(given) ||
    given.length !== 1 ||
    (received !== undefined &&
      (!Array.isArray(received) || received.length !== 0))
  )
    return null;
  const item = record(given[0]);
  if (
    !item ||
    !matchesItem(item, context.assetId) ||
    item.new_contextid !== '2' ||
    !id(item.new_assetid) ||
    item.rollback_new_assetid !== undefined ||
    item.rollback_new_contextid !== undefined
  )
    return null;
  return item.new_assetid;
}
