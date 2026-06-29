import { Injectable } from '@nestjs/common';
import { InventorySyncStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export function getInventorySyncTtlMs(): number {
  const seconds = Number(process.env.INVENTORY_SYNC_TTL_SECONDS ?? 300);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 300_000;
}

export function getInventorySyncMinIntervalMs(): number {
  const ms = Number(process.env.INVENTORY_SYNC_MIN_INTERVAL_MS ?? 60_000);
  return Number.isFinite(ms) && ms > 0 ? ms : 60_000;
}

@Injectable()
export class InventorySyncCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestRun(userId: string) {
    return this.prisma.inventorySyncRun.findFirst({
      where: { userId },
      orderBy: { fetchedAt: 'desc' },
    });
  }

  async recordRun(params: {
    userId: string;
    steamId: string;
    status: InventorySyncStatus;
    itemCount: number;
    errorCode?: string | null;
    fetchedAt?: Date;
  }) {
    const fetchedAt = params.fetchedAt ?? new Date();
    const expiresAt = new Date(fetchedAt.getTime() + getInventorySyncTtlMs());

    return this.prisma.inventorySyncRun.create({
      data: {
        userId: params.userId,
        steamId: params.steamId,
        status: params.status,
        itemCount: params.itemCount,
        fetchedAt,
        expiresAt,
        errorCode: params.errorCode ?? null,
      },
    });
  }

  isCacheValid(
    run: { status: InventorySyncStatus; expiresAt: Date },
    now = new Date(),
  ): boolean {
    return run.status === InventorySyncStatus.SUCCESS && run.expiresAt > now;
  }

  isWithinRateLimit(run: { fetchedAt: Date }, now = new Date()): boolean {
    return (
      now.getTime() - run.fetchedAt.getTime() < getInventorySyncMinIntervalMs()
    );
  }
}
