import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_MIN_INTERVAL_MS = DAY_MS;
const LOOKBACK_7D_MS = 7 * DAY_MS;
const LOOKBACK_30D_MS = 30 * DAY_MS;

export type SteamPriceChangePcts = {
  steamPriceChange7dPct: number | null;
  steamPriceChange30dPct: number | null;
};

type AnchorRow = {
  marketHashName: string;
  priceMinor: number;
};

function pctChange(current: number, past: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0) {
    return null;
  }
  return Math.round(((current - past) / past) * 1000) / 10;
}

@Injectable()
export class SteamPriceHistoryService {
  private readonly logger = new Logger(SteamPriceHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a history point when price moved or the last snapshot is ≥24h old.
   * Fire-and-forget safe: failures are logged, never thrown to callers.
   */
  async recordSnapshotIfNeeded(
    marketHashName: string,
    priceMinor: number | null,
  ): Promise<void> {
    if (!marketHashName || priceMinor == null || priceMinor <= 0) {
      return;
    }
    try {
      const latest = await this.prisma.steamPriceSnapshot.findFirst({
        where: { marketHashName },
        orderBy: { recordedAt: 'desc' },
        select: { priceMinor: true, recordedAt: true },
      });
      const minAge = new Date(Date.now() - SNAPSHOT_MIN_INTERVAL_MS);
      if (
        latest &&
        latest.priceMinor === priceMinor &&
        latest.recordedAt > minAge
      ) {
        return;
      }
      await this.prisma.steamPriceSnapshot.create({
        data: {
          marketHashName,
          priceMinor,
          recordedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `steam_price_snapshot_failed name=${marketHashName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getChangePcts(
    names: string[],
    currentByName: Record<string, number | null | undefined>,
  ): Promise<Record<string, SteamPriceChangePcts>> {
    const unique = [...new Set(names.filter(Boolean))];
    const empty: SteamPriceChangePcts = {
      steamPriceChange7dPct: null,
      steamPriceChange30dPct: null,
    };
    if (unique.length === 0) {
      return {};
    }

    const now = Date.now();
    const cutoff7 = new Date(now - LOOKBACK_7D_MS);
    const cutoff30 = new Date(now - LOOKBACK_30D_MS);

    const [anchors7, anchors30] = await Promise.all([
      this.loadAnchors(unique, cutoff7),
      this.loadAnchors(unique, cutoff30),
    ]);

    const map7 = new Map(
      anchors7.map((row) => [row.marketHashName, row.priceMinor]),
    );
    const map30 = new Map(
      anchors30.map((row) => [row.marketHashName, row.priceMinor]),
    );

    const out: Record<string, SteamPriceChangePcts> = {};
    for (const name of unique) {
      const current = currentByName[name];
      if (current == null || current <= 0) {
        out[name] = empty;
        continue;
      }
      const past7 = map7.get(name);
      const past30 = map30.get(name);
      out[name] = {
        steamPriceChange7dPct:
          past7 != null ? pctChange(current, past7) : null,
        steamPriceChange30dPct:
          past30 != null ? pctChange(current, past30) : null,
      };
    }
    return out;
  }

  private async loadAnchors(
    names: string[],
    cutoff: Date,
  ): Promise<AnchorRow[]> {
    if (names.length === 0) {
      return [];
    }
    try {
      return await this.prisma.$queryRaw<AnchorRow[]>`
        SELECT DISTINCT ON ("marketHashName")
          "marketHashName",
          "priceMinor"
        FROM "SteamPriceSnapshot"
        WHERE "marketHashName" IN (${Prisma.join(names)})
          AND "recordedAt" <= ${cutoff}
          AND "priceMinor" > 0
        ORDER BY "marketHashName", "recordedAt" DESC
      `;
    } catch (error) {
      this.logger.warn(
        `steam_price_anchor_query_failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
