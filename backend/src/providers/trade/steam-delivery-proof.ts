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
  if (context.tradeBinding && offer.message !== context.tradeBinding)
    return false;
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

/** Receipt authenticity/completion is independent of destination mapping. */
export function steamReceiptComplete(
  value: unknown,
  tradeId: string,
  context: TradeVerificationContext,
): boolean {
  const receipt = record(value);
  if (
    !receipt ||
    !id(tradeId) ||
    receipt.tradeid !== tradeId ||
    receipt.status !== 3 ||
    receipt.steamid_other !== context.buyerSteamId
  )
    return false;
  const given = receipt.assets_given;
  const received = receipt.assets_received;
  if (
    !Array.isArray(given) ||
    given.length !== 1 ||
    (received !== undefined &&
      (!Array.isArray(received) || received.length !== 0))
  )
    return false;
  const item = record(given[0]);
  return (
    !!item &&
    matchesItem(item, context.assetId) &&
    !Object.keys(item).some((key) => key.startsWith('rollback')) &&
    !Object.keys(receipt).some((key) => key.startsWith('rollback'))
  );
}

export function receivedAssetFromSteamReceipt(
  value: unknown,
  tradeId: string,
  context: TradeVerificationContext,
): string | null {
  if (!steamReceiptComplete(value, tradeId, context)) return null;
  const item = record((record(value)!.assets_given as unknown[])[0])!;
  return (item.new_contextid === '2' || item.new_contextid === '16') &&
    id(item.new_assetid)
    ? item.new_assetid
    : null;
}

export function steamReceiptReversed(
  value: unknown,
  tradeId: string,
  context: TradeVerificationContext,
): boolean {
  const receipt = record(value);
  if (
    !receipt ||
    receipt.tradeid !== tradeId ||
    receipt.steamid_other !== context.buyerSteamId
  )
    return false;
  const assets = Array.isArray(receipt.assets_given)
    ? receipt.assets_given
    : [];
  // ETradeStatus differs from ETradeOfferState: 10 is escrow, 11 its rollback.
  return (
    [4, 5, 6, 7, 8, 9, 11].includes(receipt.status as number) ||
    Object.keys(receipt).some((key) => key.startsWith('rollback')) ||
    assets.some((value) => {
      const item = record(value);
      return (
        !!item && Object.keys(item).some((key) => key.startsWith('rollback'))
      );
    })
  );
}
