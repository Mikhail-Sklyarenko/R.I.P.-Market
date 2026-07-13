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
const STEAM_BLOCK_COOLDOWN_MS = 30 * 60 * 1000;
const FALLBACK_SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const FALLBACK_PRICES_URL =
  process.env.STEAM_PRICE_FALLBACK_URL ??
  'https://market.csgo.com/api/v2/prices/USD.json';
const STEAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class SteamRateLimitError extends Error {
  constructor() {
    super('Steam rate limited');
    this.name = 'SteamRateLimitError';
  }
}

export class SteamAccessDeniedError extends Error {
  constructor() {
    super('Steam access denied');
    this.name = 'SteamAccessDeniedError';
  }
}

type FallbackSnapshot = {
  prices: Map<string, number>;
  fetchedAt: number;
  expiresAt: number;
};

type MarketCsgoPricesResponse = {
  success?: boolean;
  items?: Array<{ market_hash_name?: string; price?: string | number }>;
};

@Injectable()
export class SteamMarketPriceService {
  private readonly logger = new Logger(SteamMarketPriceService.name);
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<number | null>>();
  private steamBlockedUntil = 0;
  private fallbackSnapshot: FallbackSnapshot | null = null;
  private fallbackSnapshotInflight: Promise<FallbackSnapshot | null> | null =
    null;

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
    const steamBlocked = Date.now() < this.steamBlockedUntil;
    if (steamBlocked) {
      await this.resolvePendingFromFallback(
        pending,
        result,
        cacheTtlMs,
        failureCacheTtlMs,
      );
      return;
    }

    for (let index = 0; index < pending.length; index++) {
      const name = pending[index];
      const previous = this.memoryCache.get(name);
      const fetchedAt = Date.now();
      let priceMinor = await this.fetchPriceMinorWithRetry(name);

      if (priceMinor === null) {
        priceMinor = await this.lookupFallbackPriceMinor(name);
      }

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

      if (Date.now() < this.steamBlockedUntil) {
        const remaining = pending.slice(index + 1);
        if (remaining.length > 0) {
          await this.resolvePendingFromFallback(
            remaining,
            result,
            cacheTtlMs,
            failureCacheTtlMs,
          );
        }
        return;
      }

      if (index < pending.length - 1) {
        await sleep(STEAM_REQUEST_GAP_MS);
      }
    }
  }

  private async resolvePendingFromFallback(
    pending: string[],
    result: Record<string, SteamPriceMeta>,
    cacheTtlMs: number,
    failureCacheTtlMs: number,
  ): Promise<void> {
    await this.ensureFallbackSnapshot();
    const fetchedAt = Date.now();
    for (const name of pending) {
      const previous = this.memoryCache.get(name);
      const priceMinor =
        this.fallbackSnapshot?.prices.get(name) ??
        previous?.priceMinor ??
        null;
      const ttl = priceMinor !== null ? cacheTtlMs : failureCacheTtlMs;
      this.memoryCache.set(name, {
        priceMinor,
        fetchedAt:
          priceMinor != null && previous?.priceMinor === priceMinor
            ? previous.fetchedAt
            : fetchedAt,
        expiresAt: fetchedAt + ttl,
      });
      result[name] = {
        priceMinor,
        fetchedAt: new Date(
          priceMinor != null && previous?.priceMinor === priceMinor
            ? previous.fetchedAt
            : fetchedAt,
        ).toISOString(),
      };
      if (priceMinor !== null && previous?.priceMinor !== priceMinor) {
        await this.persistToDatabase(name, priceMinor, fetchedAt);
      }
    }
  }

  private async lookupFallbackPriceMinor(
    marketHashName: string,
  ): Promise<number | null> {
    const snapshot = await this.ensureFallbackSnapshot();
    return snapshot?.prices.get(marketHashName) ?? null;
  }

  private async ensureFallbackSnapshot(): Promise<FallbackSnapshot | null> {
    if (
      this.fallbackSnapshot &&
      this.fallbackSnapshot.expiresAt > Date.now()
    ) {
      return this.fallbackSnapshot;
    }
    if (this.fallbackSnapshotInflight) {
      return this.fallbackSnapshotInflight;
    }

    this.fallbackSnapshotInflight = this.downloadFallbackSnapshot()
      .then((snapshot) => {
        this.fallbackSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.fallbackSnapshotInflight = null;
      });

    return this.fallbackSnapshotInflight;
  }

  private async downloadFallbackSnapshot(): Promise<FallbackSnapshot | null> {
    const startedAt = Date.now();
    try {
      const body = await this.requestJson<MarketCsgoPricesResponse>(
        FALLBACK_PRICES_URL,
      );
      if (!body?.success || !Array.isArray(body.items)) {
        this.logger.warn('Steam price fallback snapshot returned no items');
        return this.fallbackSnapshot;
      }

      const prices = new Map<string, number>();
      for (const item of body.items) {
        const name = item.market_hash_name?.trim();
        if (!name) {
          continue;
        }
        const priceMinor = this.parseUsdNumberToMinor(item.price);
        if (priceMinor != null) {
          prices.set(name, priceMinor);
        }
      }

      this.logger.log(
        `Loaded Steam price fallback snapshot: ${prices.size} items in ${
          Date.now() - startedAt
        }ms`,
      );

      return {
        prices,
        fetchedAt: startedAt,
        expiresAt: startedAt + FALLBACK_SNAPSHOT_TTL_MS,
      };
    } catch (error) {
      this.logger.warn(
        `Steam price fallback snapshot failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return this.fallbackSnapshot;
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
        if (error instanceof SteamAccessDeniedError) {
          this.steamBlockedUntil = Date.now() + STEAM_BLOCK_COOLDOWN_MS;
          this.logger.warn(
            `Steam market blocked this IP (403). Using fallback prices for ${Math.round(
              STEAM_BLOCK_COOLDOWN_MS / 60_000,
            )} minutes.`,
          );
          return null;
        }
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
          if (response.statusCode === 403) {
            response.resume();
            reject(new SteamAccessDeniedError());
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

  private requestJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': STEAM_USER_AGENT,
          },
          timeout: 30_000,
        },
        (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            const location = response.headers.location;
            response.resume();
            if (!location) {
              reject(new Error(`Redirect without location from ${url}`));
              return;
            }
            resolve(this.requestJson<T>(location));
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`HTTP ${response.statusCode} from ${url}`));
            return;
          }

          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on('timeout', () => {
        request.destroy();
        reject(new Error(`Request timed out: ${url}`));
      });
      request.on('error', reject);
    });
  }

  private parseUsdNumberToMinor(value?: string | number): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      return Math.round(value * 100);
    }
    return this.parseUsdToMinor(value);
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
