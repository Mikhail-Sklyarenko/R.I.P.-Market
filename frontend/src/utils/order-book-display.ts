import type { BuyRequest, ItemOrderBook } from '../api/types';

/** Remove the current user's open buy requests from aggregated bid levels. */
export function excludeOwnBuyRequestsFromOrderBook(
  orderBook: ItemOrderBook,
  ownRequests: BuyRequest[],
): ItemOrderBook {
  if (ownRequests.length === 0) {
    return orderBook;
  }

  const ownByPrice = new Map<string, number>();
  for (const request of ownRequests) {
    if (!request.maxPriceMinor) {
      continue;
    }
    const remaining = request.quantity - request.quantityFilled;
    if (remaining <= 0) {
      continue;
    }
    ownByPrice.set(
      request.maxPriceMinor,
      (ownByPrice.get(request.maxPriceMinor) ?? 0) + remaining,
    );
  }

  if (ownByPrice.size === 0) {
    return orderBook;
  }

  const bids = orderBook.bids
    .map((level) => ({
      ...level,
      quantity: level.quantity - (ownByPrice.get(level.priceMinor) ?? 0),
    }))
    .filter((level) => level.quantity > 0);

  const bestBidMinor = bids[0]?.priceMinor ?? null;
  let spreadMinor: string | null = null;
  if (bestBidMinor && orderBook.bestAskMinor) {
    const spread = BigInt(orderBook.bestAskMinor) - BigInt(bestBidMinor);
    spreadMinor = spread > 0n ? spread.toString() : '0';
  }

  return {
    ...orderBook,
    bids,
    bestBidMinor,
    spreadMinor,
  };
}
