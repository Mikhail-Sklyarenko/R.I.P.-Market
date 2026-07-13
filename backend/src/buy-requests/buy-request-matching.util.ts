export const BUY_REQUEST_TTL_DAYS = 30;

export type BuyRequestMatchCandidate = {
  id: string;
  buyerId: string;
  maxPriceMinor: bigint | null;
  lastNotifiedLotId: string | null;
  lastNotifiedPriceMinor: bigint | null;
};

export type LotMatchCandidate = {
  id: string;
  sellerId: string;
  priceMinor: bigint;
  itemDefinitionId: string;
};

export function lotMatchesBuyRequestPrice(
  buyRequest: Pick<BuyRequestMatchCandidate, 'maxPriceMinor'>,
  lot: Pick<LotMatchCandidate, 'priceMinor'>,
): boolean {
  if (buyRequest.maxPriceMinor == null) {
    return true;
  }
  return lot.priceMinor <= buyRequest.maxPriceMinor;
}

export function shouldNotifyBuyRequestMatch(
  buyRequest: BuyRequestMatchCandidate,
  lot: LotMatchCandidate,
): boolean {
  if (buyRequest.buyerId === lot.sellerId) {
    return false;
  }
  if (!lotMatchesBuyRequestPrice(buyRequest, lot)) {
    return false;
  }
  if (!buyRequest.lastNotifiedLotId) {
    return true;
  }
  if (buyRequest.lastNotifiedLotId === lot.id) {
    return false;
  }
  if (buyRequest.lastNotifiedPriceMinor == null) {
    return true;
  }
  return lot.priceMinor < buyRequest.lastNotifiedPriceMinor;
}
