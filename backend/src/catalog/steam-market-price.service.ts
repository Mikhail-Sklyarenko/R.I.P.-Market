import { Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import { PrismaService } from '../prisma/prisma.service';

type CacheEntry = {
  priceMinor: number | null;
  fetchedAt: number;
  expiresAt: number;
};

export type SteamPriceFetchOptions = {
  forceRefresh?: boolean;
  cacheOnly?: boolean;
  cacheTtlMs?: number;
  failureCacheTtlMs?: number;
};

export type SteamPriceMeta = {
  priceMinor: number | null;
  fetchedAt: string | null;
};

type SteamPriceOverviewResponse = {
  success?: boolean;
  lowest_price?: string;
  median_price?: string;
};

export const STEAM_PRICE_CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_FAILURE_CACHE_TTL_MS = 60 * 1000;
const STEAM_REQUEST_GAP_MS = 90;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;
const RATE_LIMIT_RETRY_MS = [800, 2_000, 4_000];
const FETCH_TIMEOUT_MS = 10_000;
const STEAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class SteamRateLimitError extends Error {
  constructor() {
    super('Steam rate limited');
    this.name = 'SteamRateLimitError';
  }
}

@Injectable()
export class SteamMarketPriceService {
  private readonly logger = new Logger(SteamMarketPriceService.name);
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<number | null>>();

  constructor(private readonly prisma: PrismaService) {}

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
    const cacheTtlMs = options?.cacheTtlMs ?? STEAM_PRICE_CACHE_TTL_MS;
    const failureCacheTtlMs =
      options?.failureCacheTtlMs ?? DEFAULT_FAILURE_CACHE_TTL_MS;

    const dbRows = await this.loadFromDatabase(unique);

    for (const name of unique) {
      const dbEntry = dbRows.get(name);
      if (dbEntry) {
        this.syncMemoryFromDatabase(name, dbEntry, cacheTtlMs, failureCacheTtlMs);
      }

      if (options?.forceRefresh) {
        pending.push(name);
        continue;
      }

      const memoryEntry = this.memoryCache.get(name);
      if (options?.cacheOnly) {
        result[name] = this.toMetaFromDatabase(dbEntry);
        continue;
      }

      if (
        memoryEntry &&
        memoryEntry.expiresAt > Date.now() &&
        memoryEntry.priceMinor != null
      ) {
        result[name] = {
          priceMinor: memoryEntry.priceMinor,
          fetchedAt: new Date(memoryEntry.fetchedAt).toISOString(),
        };
        continue;
      }

      // Serve any stored Steam price immediately; refresh only hard misses.
      if (dbEntry?.priceMinor != null) {
        result[name] = this.toMetaFromDatabase(dbEntry);
        continue;
      }

      pending.push(name);
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

  private async loadFromDatabase(marketHashNames: string[]) {
    if (marketHashNames.length === 0) {
      return new Map<
        string,
        { marketHashName: string; priceMinor: number | null; fetchedAt: Date }
      >();
    }

    const rows = await this.prisma.steamPriceCache.findMany({
      where: { marketHashName: { in: marketHashNames } },
    });
    return new Map(rows.map((row) => [row.marketHashName, row]));
  }

  private syncMemoryFromDatabase(
    name: string,
    dbEntry: { priceMinor: number | null; fetchedAt: Date },
    cacheTtlMs: number,
    failureCacheTtlMs: number,
  ): void {
    const fetchedAt = dbEntry.fetchedAt.getTime();
    const ttl =
      dbEntry.priceMinor != null ? cacheTtlMs : failureCacheTtlMs;
    this.memoryCache.set(name, {
      priceMinor: dbEntry.priceMinor,
      fetchedAt,
      expiresAt: fetchedAt + ttl,
    });
  }

  private toMetaFromDatabase(
    dbEntry?: {
      priceMinor: number | null;
      fetchedAt: Date;
    } | null,
  ): SteamPriceMeta {
    if (!dbEntry) {
      return { priceMinor: null, fetchedAt: null };
    }
    return {
      priceMinor: dbEntry.priceMinor,
      fetchedAt: dbEntry.fetchedAt.toISOString(),
    };
  }

  private async persistToDatabase(
    marketHashName: string,
    priceMinor: number | null,
    fetchedAt: number,
  ): Promise<void> {
    const fetchedAtDate = new Date(fetchedAt);
    await this.prisma.steamPriceCache.upsert({
      where: { marketHashName },
      create: {
        marketHashName,
        priceMinor,
        fetchedAt: fetchedAtDate,
      },
      update: {
        priceMinor,
        fetchedAt: fetchedAtDate,
      },
    });
  }

  private async fetchAndCacheBatch(
    pending: string[],
    result: Record<string, SteamPriceMeta>,
    cacheTtlMs: number,
    failureCacheTtlMs: number,
  ): Promise<void> {
    for (let index = 0; index < pending.length; index++) {
      const name = pending[index];
      const previous = this.memoryCache.get(name);
      const fetchedAt = Date.now();
      let priceMinor = await this.fetchPriceMinorWithRetry(name);

      if (priceMinor === null && previous?.priceMinor != null) {
        result[name] = {
          priceMinor: previous.priceMinor,
          fetchedAt: new Date(previous.fetchedAt).toISOString(),
        };
        this.memoryCache.set(name, {
          priceMinor: previous.priceMinor,
          fetchedAt: previous.fetchedAt,
          expiresAt: fetchedAt + failureCacheTtlMs,
        });
      } else {
        const ttl = priceMinor !== null ? cacheTtlMs : failureCacheTtlMs;
        this.memoryCache.set(name, {
          priceMinor,
          fetchedAt,
          expiresAt: fetchedAt + ttl,
        });
        result[name] = {
          priceMinor,
          fetchedAt: new Date(fetchedAt).toISOString(),
        };
        if (priceMinor !== null) {
          await this.persistToDatabase(name, priceMinor, fetchedAt);
        }
      }

      if (index < pending.length - 1) {
        await sleep(STEAM_REQUEST_GAP_MS);
      }
    }
  }

  private async fetchPriceMinorWithRetry(
    marketHashName: string,
  ): Promise<number | null> {
    const inflight = this.inflight.get(marketHashName);
    if (inflight) {
      return inflight;
    }

    const promise = this.fetchPriceMinorWithRetryInner(marketHashName).finally(
      () => {
        this.inflight.delete(marketHashName);
      },
    );
    this.inflight.set(marketHashName, promise);
    return promise;
  }

  private async fetchPriceMinorWithRetryInner(
    marketHashName: string,
  ): Promise<number | null> {
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        // A definite Steam response (including "no listings") must not be retried —
        // medals/coins and empty markets would otherwise burn the whole rate budget.
        return await this.fetchPriceMinor(marketHashName);
      } catch (error) {
        if (
          error instanceof SteamRateLimitError &&
          attempt < MAX_FETCH_ATTEMPTS
        ) {
          await sleep(RATE_LIMIT_RETRY_MS[attempt - 1] ?? 8_000);
          continue;
        }
        this.logger.warn(
          `Steam market price fetch failed for ${marketHashName}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        if (attempt >= MAX_FETCH_ATTEMPTS) {
          return null;
        }
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
    const payload = await this.requestSteamPriceOverview(marketHashName);
    if (!payload?.success) {
      return null;
    }
    return (
      this.parseUsdToMinor(payload.lowest_price) ??
      this.parseUsdToMinor(payload.median_price)
    );
  }

  private requestSteamPriceOverview(
    marketHashName: string,
  ): Promise<SteamPriceOverviewResponse | null> {
    const url = new URL('https://steamcommunity.com/market/priceoverview/');
    url.searchParams.set('country', 'US');
    url.searchParams.set('currency', '1');
    url.searchParams.set('appid', '730');
    url.searchParams.set('market_hash_name', marketHashName);

    return new Promise((resolve, reject) => {
      const request = https.get(
        url.toString(),
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': STEAM_USER_AGENT,
          },
          timeout: FETCH_TIMEOUT_MS,
        },
        (response) => {
          if (response.statusCode === 429) {
            response.resume();
            reject(new SteamRateLimitError());
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            resolve(null);
            return;
          }

          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            try {
              resolve(JSON.parse(body) as SteamPriceOverviewResponse);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Steam market price request timed out'));
      });
      request.on('error', reject);
    });
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
