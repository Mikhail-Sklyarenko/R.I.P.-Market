import { Injectable, Logger } from '@nestjs/common';
import {
  getReferencePriceCacheTtlMs,
  isBuffReferenceEnabled,
  isCsfloatReferenceEnabled,
  isReferencePriceEnabled,
} from './reference-price.config';

export type ReferencePriceEntry = {
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  fetchedAt: string | null;
};

type CacheEntry = {
  buffPriceMinor: number | null;
  csfloatPriceMinor: number | null;
  fetchedAt: number;
  expiresAt: number;
};

type CsfloatListingsResponse = {
  data?: Array<{ price?: number }>;
};

type CsgotraderPricesResponse = {
  items?: Record<
    string,
    {
      buff?: {
        price?: number | null;
        starting_at?: { price?: number | null };
      };
    }
  >;
};

@Injectable()
export class ReferencePriceService {
  private readonly logger = new Logger(ReferencePriceService.name);
  private readonly cache = new Map<string, CacheEntry>();

  isEnabled(): boolean {
    return isReferencePriceEnabled();
  }

  async getPricesWithMeta(
    marketHashNames: string[],
  ): Promise<Record<string, ReferencePriceEntry>> {
    if (!this.isEnabled()) {
      return Object.fromEntries(
        marketHashNames.map((name) => [
          name,
          { buffPriceMinor: null, csfloatPriceMinor: null, fetchedAt: null },
        ]),
      );
    }

    const unique = [...new Set(marketHashNames.filter(Boolean))];
    const result: Record<string, ReferencePriceEntry> = {};
    const pending: string[] = [];

    for (const name of unique) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > Date.now()) {
        result[name] = {
          buffPriceMinor: cached.buffPriceMinor,
          csfloatPriceMinor: cached.csfloatPriceMinor,
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
        };
      } else {
        pending.push(name);
      }
    }

    await Promise.all(
      pending.map(async (name) => {
        const fetchedAt = Date.now();
        const [buffPriceMinor, csfloatPriceMinor] = await Promise.all([
          this.fetchBuffPriceMinor(name),
          this.fetchCsfloatPriceMinor(name),
        ]);

        this.cache.set(name, {
          buffPriceMinor,
          csfloatPriceMinor,
          fetchedAt,
          expiresAt: fetchedAt + getReferencePriceCacheTtlMs(),
        });

        result[name] = {
          buffPriceMinor,
          csfloatPriceMinor,
          fetchedAt: new Date(fetchedAt).toISOString(),
        };
      }),
    );

    return result;
  }

  private async fetchCsfloatPriceMinor(
    marketHashName: string,
  ): Promise<number | null> {
    if (!isCsfloatReferenceEnabled()) {
      return null;
    }

    try {
      const url = new URL('https://csfloat.com/api/v1/listings');
      url.searchParams.set('market_hash_name', marketHashName);
      url.searchParams.set('sort_by', 'lowest_price');
      url.searchParams.set('limit', '1');
      url.searchParams.set('type', 'buy_now');

      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as CsfloatListingsResponse;
      const priceCents = body.data?.[0]?.price;
      if (priceCents === undefined || priceCents === null) {
        return null;
      }
      return Math.round(Number(priceCents));
    } catch (error) {
      this.logger.debug(
        `CSFloat reference price failed for ${marketHashName}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return null;
    }
  }

  private async fetchBuffPriceMinor(
    marketHashName: string,
  ): Promise<number | null> {
    if (!isBuffReferenceEnabled()) {
      return null;
    }

    try {
      const response = await fetch('https://prices.csgotrader.app/latest/prices.json');
      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as CsgotraderPricesResponse;
      const item = body.items?.[marketHashName];
      const buffUsd =
        item?.buff?.starting_at?.price ??
        item?.buff?.price ??
        null;
      if (buffUsd === null || buffUsd === undefined) {
        return null;
      }
      return Math.round(Number(buffUsd) * 100);
    } catch (error) {
      this.logger.debug(
        `Buff reference price failed for ${marketHashName}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return null;
    }
  }
}
