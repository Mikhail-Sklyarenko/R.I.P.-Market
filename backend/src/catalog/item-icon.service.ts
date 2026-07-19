import { Injectable, Logger } from '@nestjs/common';
import { steamFetch } from '../common/steam/steam-http.client';
import { PrismaService } from '../prisma/prisma.service';

type SteamMarketSearchRenderResponse = {
  success?: boolean;
  results?: Array<{
    hash_name?: string;
    asset_description?: {
      icon_url?: string;
      icon_url_large?: string;
      market_hash_name?: string;
    };
  }>;
};

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

const STEAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;
const STEAM_REQUEST_GAP_MS = 120;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;
const RATE_LIMIT_RETRY_MS = [800, 2_000, 4_000];
const STEAM_BLOCK_COOLDOWN_MS = 30 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_SCHEDULE_BATCH = 12;

@Injectable()
export class ItemIconService {
  private readonly logger = new Logger(ItemIconService.name);
  private readonly inflight = new Map<string, Promise<string | null>>();
  private readonly recentFailures = new Map<string, number>();
  private steamBlockedUntil = 0;
  private refreshRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return process.env.STEAM_ITEM_ICON_ENABLED !== 'false';
  }

  isSteamBlocked(): boolean {
    return Date.now() < this.steamBlockedUntil;
  }

  /**
   * Fire-and-forget: fill missing ItemDefinition.iconUrl for catalog rows.
   * Prefer copying from listing snapshots, then Steam market search.
   */
  scheduleMissingIconRefresh(
    rows: Array<{ id: string; marketHashName: string; iconUrl: string | null }>,
  ): void {
    if (!this.isEnabled()) {
      return;
    }
    const missing = rows
      .filter((row) => !row.iconUrl?.trim())
      .slice(0, MAX_SCHEDULE_BATCH);
    if (missing.length === 0 || this.refreshRunning) {
      return;
    }

    this.refreshRunning = true;
    void this.refreshMissingIcons(missing)
      .catch((error) => {
        this.logger.warn(
          `Item icon refresh failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      })
      .finally(() => {
        this.refreshRunning = false;
      });
  }

  async refreshMissingIcons(
    rows: Array<{ id: string; marketHashName: string }>,
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    let updated = await this.backfillFromListingSnapshots(rows.map((r) => r.id));

    const stillMissing = await this.prisma.itemDefinition.findMany({
      where: {
        id: { in: rows.map((r) => r.id) },
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      select: { id: true, marketHashName: true },
    });

    for (let index = 0; index < stillMissing.length; index++) {
      const item = stillMissing[index];
      if (Date.now() < this.steamBlockedUntil) {
        break;
      }
      if (this.isInFailureCooldown(item.marketHashName)) {
        continue;
      }

      const iconUrl = await this.fetchIconUrl(item.marketHashName);
      if (iconUrl) {
        await this.persistIcon(item.id, item.marketHashName, iconUrl);
        updated += 1;
        this.recentFailures.delete(item.marketHashName);
      } else {
        this.recentFailures.set(item.marketHashName, Date.now());
      }

      if (index < stillMissing.length - 1) {
        await sleep(STEAM_REQUEST_GAP_MS);
      }
    }

    if (updated > 0) {
      this.logger.log(`Backfilled ${updated} item definition icon(s)`);
    }
    return updated;
  }

  /**
   * Global DB-only backfill: any definition missing an icon that can be
   * copied from LotListingSnapshot (by asset link or marketHashName).
   */
  async backfillMissingFromSnapshots(limit = 200): Promise<number> {
    const missing = await this.prisma.itemDefinition.findMany({
      where: {
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    if (missing.length === 0) {
      return 0;
    }
    return this.backfillFromListingSnapshots(missing.map((row) => row.id));
  }

  /**
   * Copy iconUrl from LotListingSnapshot onto ItemDefinition when the def has none.
   * Matches by inventory asset link first, then by marketHashName.
   */
  async backfillFromListingSnapshots(definitionIds: string[]): Promise<number> {
    const uniqueIds = [...new Set(definitionIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return 0;
    }

    const definitions = await this.prisma.itemDefinition.findMany({
      where: {
        id: { in: uniqueIds },
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      select: { id: true, marketHashName: true },
    });
    if (definitions.length === 0) {
      return 0;
    }

    const iconByDefinition = new Map<string, string>();

    const lots = await this.prisma.lot.findMany({
      where: {
        inventoryAsset: {
          itemDefinitionId: { in: definitions.map((d) => d.id) },
        },
        listingSnapshot: {
          iconUrl: { not: null },
        },
      },
      select: {
        inventoryAsset: { select: { itemDefinitionId: true } },
        listingSnapshot: { select: { iconUrl: true } },
      },
      take: 500,
    });

    for (const lot of lots) {
      const defId = lot.inventoryAsset.itemDefinitionId;
      const icon = lot.listingSnapshot?.iconUrl?.trim();
      if (!icon || iconByDefinition.has(defId)) {
        continue;
      }
      iconByDefinition.set(defId, icon);
    }

    const stillNeed = definitions.filter((d) => !iconByDefinition.has(d.id));
    if (stillNeed.length > 0) {
      const snapshots = await this.prisma.lotListingSnapshot.findMany({
        where: {
          marketHashName: { in: stillNeed.map((d) => d.marketHashName) },
          iconUrl: { not: null },
        },
        select: { marketHashName: true, iconUrl: true },
        take: 500,
      });
      const iconByName = new Map<string, string>();
      for (const snapshot of snapshots) {
        const icon = snapshot.iconUrl?.trim();
        if (!icon || iconByName.has(snapshot.marketHashName)) {
          continue;
        }
        iconByName.set(snapshot.marketHashName, icon);
      }
      for (const def of stillNeed) {
        const icon = iconByName.get(def.marketHashName);
        if (icon) {
          iconByDefinition.set(def.id, icon);
        }
      }
    }

    let updated = 0;
    for (const [id, iconUrl] of iconByDefinition) {
      const def = definitions.find((row) => row.id === id);
      const result = await this.prisma.itemDefinition.updateMany({
        where: {
          id,
          OR: [{ iconUrl: null }, { iconUrl: '' }],
        },
        data: { iconUrl },
      });
      if (result.count > 0) {
        updated += result.count;
        if (def) {
          await this.backfillEmptySnapshots(def.marketHashName, iconUrl);
        }
      }
    }
    return updated;
  }

  async persistIcon(
    definitionId: string,
    marketHashName: string,
    iconUrl: string,
  ): Promise<void> {
    await this.prisma.itemDefinition.update({
      where: { id: definitionId },
      data: { iconUrl },
    });
    await this.backfillEmptySnapshots(marketHashName, iconUrl);
  }

  private async backfillEmptySnapshots(
    marketHashName: string,
    iconUrl: string,
  ): Promise<void> {
    await this.prisma.lotListingSnapshot.updateMany({
      where: {
        marketHashName,
        OR: [{ iconUrl: null }, { iconUrl: '' }],
      },
      data: { iconUrl },
    });
  }

  async fetchIconUrl(marketHashName: string): Promise<string | null> {
    const inflight = this.inflight.get(marketHashName);
    if (inflight) {
      return inflight;
    }

    const promise = this.fetchIconUrlWithRetry(marketHashName).finally(() => {
      this.inflight.delete(marketHashName);
    });
    this.inflight.set(marketHashName, promise);
    return promise;
  }

  private isInFailureCooldown(marketHashName: string): boolean {
    const failedAt = this.recentFailures.get(marketHashName);
    if (!failedAt) {
      return false;
    }
    return Date.now() - failedAt < FAILURE_COOLDOWN_MS;
  }

  private async fetchIconUrlWithRetry(
    marketHashName: string,
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        return await this.fetchIconUrlOnce(marketHashName);
      } catch (error) {
        if (error instanceof SteamAccessDeniedError) {
          this.steamBlockedUntil = Date.now() + STEAM_BLOCK_COOLDOWN_MS;
          this.logger.warn(
            `Steam market blocked this IP (403). Pausing icon fetches for ${Math.round(
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
          `Steam icon fetch failed for ${marketHashName}: ${
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

  private async fetchIconUrlOnce(
    marketHashName: string,
  ): Promise<string | null> {
    const url = new URL('https://steamcommunity.com/market/search/render/');
    url.searchParams.set('appid', '730');
    url.searchParams.set('norender', '1');
    url.searchParams.set('count', '5');
    url.searchParams.set('search_descriptions', '0');
    url.searchParams.set('query', marketHashName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await steamFetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': STEAM_USER_AGENT,
        },
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new SteamRateLimitError();
      }
      if (response.status === 403) {
        throw new SteamAccessDeniedError();
      }
      if (response.status !== 200) {
        return null;
      }

      const payload = (await response.json()) as SteamMarketSearchRenderResponse;
      if (!payload?.success || !Array.isArray(payload.results)) {
        return null;
      }

      const exact =
        payload.results.find(
          (row) =>
            row.hash_name === marketHashName ||
            row.asset_description?.market_hash_name === marketHashName,
        ) ?? payload.results[0];

      const icon =
        exact?.asset_description?.icon_url_large?.trim() ||
        exact?.asset_description?.icon_url?.trim() ||
        null;
      return icon || null;
    } catch (error) {
      if (
        error instanceof SteamRateLimitError ||
        error instanceof SteamAccessDeniedError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Steam market icon request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
