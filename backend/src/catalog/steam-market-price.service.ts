import { Injectable, Logger } from '@nestjs/common';

type CacheEntry = {
  priceMinor: number | null;
  fetchedAt: number;
  expiresAt: number;
};

export type SteamPriceFetchOptions = {
  forceRefresh?: boolean;
  cacheTtlMs?: number;
  failureCacheTtlMs?: number;
};

export type SteamPriceMeta = {
  priceMinor: number | null;
  fetchedAt: string | null;
};

const DEFAULT_CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_FAILURE_CACHE_TTL_MS = 30 * 1000;
const FETCH_BATCH_SIZE = 4;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

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
    options?: SteamPriceFetchOptions,
  ): Promise<SteamPriceMeta> {
    const result = await this.getPricesWithMeta([marketHashName], options);
    const entry = result[marketHashName];
    return {
      priceMinor: entry?.priceMinor ?? null,
      fetchedAt: entry?.fetchedAt ?? null,
    };
  }

  async getPricesWithMeta(
    marketHashNames: string[],
    options?: SteamPriceFetchOptions,
  ): Promise<Record<string, SteamPriceMeta>> {
    if (!this.isEnabled()) {
      return this.getDevMockPricesWithMeta(marketHashNames);
    }

    const unique = [...new Set(marketHashNames.filter(Boolean))];
    const result: Record<string, SteamPriceMeta> = {};
    const pending: string[] = [];
    const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const failureCacheTtlMs =
      options?.failureCacheTtlMs ?? DEFAULT_FAILURE_CACHE_TTL_MS;

    for (const name of unique) {
      if (options?.forceRefresh) {
        pending.push(name);
        continue;
      }

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

    await this.fetchAndCacheBatch(pending, result, cacheTtlMs, failureCacheTtlMs);

    return result;
  }

  async getPricesMinor(
    marketHashNames: string[],
    options?: SteamPriceFetchOptions,
  ): Promise<Record<string, number | null>> {
    const withMeta = await this.getPricesWithMeta(marketHashNames, options);
    return Object.fromEntries(
      Object.entries(withMeta).map(([name, entry]) => [name, entry.priceMinor]),
    );
  }

  private async fetchAndCacheBatch(
    pending: string[],
    result: Record<string, SteamPriceMeta>,
    cacheTtlMs: number,
    failureCacheTtlMs: number,
  ): Promise<void> {
    for (let index = 0; index < pending.length; index += FETCH_BATCH_SIZE) {
      const batch = pending.slice(index, index + FETCH_BATCH_SIZE);
      await Promise.all(
        batch.map(async (name) => {
          const fetchedAt = Date.now();
          const priceMinor = await this.fetchPriceMinorWithRetry(name);
          const ttl = priceMinor !== null ? cacheTtlMs : failureCacheTtlMs;
          this.cache.set(name, {
            priceMinor,
            fetchedAt,
            expiresAt: fetchedAt + ttl,
          });
          result[name] = {
            priceMinor,
            fetchedAt: new Date(fetchedAt).toISOString(),
          };
        }),
      );
    }
  }

  private async fetchPriceMinorWithRetry(
    marketHashName: string,
  ): Promise<number | null> {
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      const priceMinor = await this.fetchPriceMinor(marketHashName);
      if (priceMinor !== null) {
        return priceMinor;
      }
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    return null;
  }

  private getDevMockPricesWithMeta(
    marketHashNames: string[],
  ): Record<string, SteamPriceMeta> {
    const fetchedAt = new Date().toISOString();
    return Object.fromEntries(
      marketHashNames.map((name) => [
        name,
        {
          priceMinor: this.getDevMockPriceMinor(name),
          fetchedAt,
        },
      ]),
    );
  }

  private getDevMockPriceMinor(marketHashName: string): number {
    let hash = 0;
    for (let index = 0; index < marketHashName.length; index++) {
      hash = (hash * 31 + marketHashName.charCodeAt(index)) >>> 0;
    }
    return 500 + (hash % 20_000);
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
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RIP-Market/1.0',
        },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
