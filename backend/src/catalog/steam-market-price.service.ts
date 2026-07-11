import { Injectable, Logger } from '@nestjs/common';

type CacheEntry = {
  priceMinor: number | null;
  fetchedAt: number;
  expiresAt: number;
};

const CACHE_TTL_MS = 20 * 60 * 1000;

@Injectable()
export class SteamMarketPriceService {
  private readonly logger = new Logger(SteamMarketPriceService.name);
  private readonly cache = new Map<string, CacheEntry>();

  isEnabled(): boolean {
    return process.env.STEAM_MARKET_PRICE_ENABLED !== 'false';
  }

  async getPriceMinor(marketHashName: string): Promise<number | null> {
    const meta = await this.getPriceMeta(marketHashName);
    return meta.priceMinor;
  }

  async getPriceMeta(
    marketHashName: string,
  ): Promise<{ priceMinor: number | null; fetchedAt: string | null }> {
    const result = await this.getPricesWithMeta([marketHashName]);
    const entry = result[marketHashName];
    return {
      priceMinor: entry?.priceMinor ?? null,
      fetchedAt: entry?.fetchedAt ?? null,
    };
  }

  async getPricesWithMeta(
    marketHashNames: string[],
  ): Promise<
    Record<string, { priceMinor: number | null; fetchedAt: string | null }>
  > {
    if (!this.isEnabled()) {
      return Object.fromEntries(
        marketHashNames.map((name) => [
          name,
          { priceMinor: null, fetchedAt: null },
        ]),
      );
    }

    const unique = [...new Set(marketHashNames.filter(Boolean))];
    const result: Record<
      string,
      { priceMinor: number | null; fetchedAt: string | null }
    > = {};
    const pending: string[] = [];

    for (const name of unique) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > Date.now()) {
        result[name] = {
          priceMinor: cached.priceMinor,
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
        };
      } else {
        pending.push(name);
      }
    }

    await Promise.all(
      pending.map(async (name) => {
        const fetchedAt = Date.now();
        const priceMinor = await this.fetchPriceMinor(name);
        this.cache.set(name, {
          priceMinor,
          fetchedAt,
          expiresAt: fetchedAt + CACHE_TTL_MS,
        });
        result[name] = {
          priceMinor,
          fetchedAt: new Date(fetchedAt).toISOString(),
        };
      }),
    );

    return result;
  }

  async getPricesMinor(
    marketHashNames: string[],
  ): Promise<Record<string, number | null>> {
    const withMeta = await this.getPricesWithMeta(marketHashNames);
    return Object.fromEntries(
      Object.entries(withMeta).map(([name, entry]) => [name, entry.priceMinor]),
    );
  }

  private async fetchPriceMinor(
    marketHashName: string,
  ): Promise<number | null> {
    const url = new URL('https://steamcommunity.com/market/priceoverview/');
    url.searchParams.set('country', 'US');
    url.searchParams.set('currency', '1');
    url.searchParams.set('appid', '730');
    url.searchParams.set('market_hash_name', marketHashName);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as {
        success?: boolean;
        lowest_price?: string;
        median_price?: string;
      };
      if (!payload.success) {
        return null;
      }
      return (
        this.parseUsdToMinor(payload.lowest_price) ??
        this.parseUsdToMinor(payload.median_price)
      );
    } catch (error) {
      this.logger.warn(
        `Steam market price fetch failed for ${marketHashName}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  private parseUsdToMinor(value?: string): number | null {
    if (!value?.trim()) {
      return null;
    }
    const normalized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    return Math.round(amount * 100);
  }
}
