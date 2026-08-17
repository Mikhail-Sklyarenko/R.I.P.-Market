export type BidLevel = {
  priceMinor: string;
  quantity: number;
};

export type AskPreviewRow = {
  lotId: string;
  priceMinor: string;
  floatValue: number | null;
  wear: string | null;
};

export type OrderBookAsksSummary = {
  count: number;
  minPriceMinor: string | null;
};

export type OrderBookSnapshot = {
  bids: BidLevel[];
  asks: AskPreviewRow[];
  asksSummary: OrderBookAsksSummary;
  bestBidMinor: string | null;
  bestAskMinor: string | null;
  spreadMinor: string | null;
};

type OpenBuyRequestRow = {
  maxPriceMinor: bigint | null;
  quantity: number;
  quantityFilled: number;
};

export function aggregateBidLevels(requests: OpenBuyRequestRow[]): BidLevel[] {
  const levels = new Map<string, number>();

  for (const request of requests) {
    if (request.maxPriceMinor == null || request.maxPriceMinor <= 0n) {
      continue;
    }
    const remaining = request.quantity - request.quantityFilled;
    if (remaining <= 0) {
      continue;
    }
    const key = request.maxPriceMinor.toString();
    levels.set(key, (levels.get(key) ?? 0) + remaining);
  }

  return [...levels.entries()]
    .map(([priceMinor, quantity]) => ({ priceMinor, quantity }))
    .sort((left, right) => {
      const diff = BigInt(right.priceMinor) - BigInt(left.priceMinor);
      if (diff > 0n) {
        return 1;
      }
      if (diff < 0n) {
        return -1;
      }
      return 0;
    });
}

export function buildOrderBookSnapshot(params: {
  bids: BidLevel[];
  asks: AskPreviewRow[];
  asksCount: number;
  minAskPriceMinor: bigint | null;
}): OrderBookSnapshot {
  const bestBidMinor = params.bids[0]?.priceMinor ?? null;
  const bestAskMinor =
    params.minAskPriceMinor != null ? params.minAskPriceMinor.toString() : null;

  let spreadMinor: string | null = null;
  if (bestBidMinor && bestAskMinor) {
    const spread = BigInt(bestAskMinor) - BigInt(bestBidMinor);
    spreadMinor = spread > 0n ? spread.toString() : '0';
  }

  return {
    bids: params.bids,
    asks: params.asks,
    asksSummary: {
      count: params.asksCount,
      minPriceMinor: bestAskMinor,
    },
    bestBidMinor,
    bestAskMinor,
    spreadMinor,
  };
}
