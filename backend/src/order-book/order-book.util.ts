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
  /** Aggregated sell depth by price (fungible order-book UI). */
  asksLevels: BidLevel[];
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

type AskPriceRow = {
  priceMinor: bigint | string | number;
};

function comparePriceAsc(left: string, right: string): number {
  const diff = BigInt(left) - BigInt(right);
  if (diff < 0n) {
    return -1;
  }
  if (diff > 0n) {
    return 1;
  }
  return 0;
}

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

/** Group active sell lots by price ascending (cheapest first). */
export function aggregateAskLevels(lots: AskPriceRow[]): BidLevel[] {
  const levels = new Map<string, number>();

  for (const lot of lots) {
    const key =
      typeof lot.priceMinor === 'bigint' || typeof lot.priceMinor === 'number'
        ? lot.priceMinor.toString()
        : String(lot.priceMinor);
    if (!key || key === '0') {
      continue;
    }
    levels.set(key, (levels.get(key) ?? 0) + 1);
  }

  return [...levels.entries()]
    .map(([priceMinor, quantity]) => ({ priceMinor, quantity }))
    .sort((left, right) => comparePriceAsc(left.priceMinor, right.priceMinor));
}

export function buildOrderBookSnapshot(params: {
  bids: BidLevel[];
  asks: AskPreviewRow[];
  asksLevels?: BidLevel[];
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

  const asksLevels =
    params.asksLevels ??
    aggregateAskLevels(params.asks.map((ask) => ({ priceMinor: ask.priceMinor })));

  return {
    bids: params.bids,
    asks: params.asks,
    asksLevels,
    asksSummary: {
      count: params.asksCount,
      minPriceMinor: bestAskMinor,
    },
    bestBidMinor,
    bestAskMinor,
    spreadMinor,
  };
}
