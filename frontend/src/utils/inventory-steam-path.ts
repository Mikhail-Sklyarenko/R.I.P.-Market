/**
 * When site inventory sync is degraded, steer sellers to Steam + extension
 * instead of an endless skeleton / empty grid.
 */

export type InventorySteamPathReason =
  | 'steam_blocked'
  | 'sync_failed'
  | 'loading_stuck'
  | 'stale_cache';

/** Show Steam-path after this long on an empty loading grid. */
export const INVENTORY_LOADING_STUCK_MS = 12_000;

export function resolveInventorySteamPathReason(params: {
  errorCode?: string | null;
  stale?: boolean;
  assetsCount: number;
  loading: boolean;
  backgroundSyncing?: boolean;
  syncPollTimedOut?: boolean;
  /** Elapsed ms while loading or background-syncing with zero assets. */
  emptyWaitMs?: number;
}): InventorySteamPathReason | null {
  const code = params.errorCode?.trim() || null;

  if (code === 'STEAM_BLOCKED') {
    return params.assetsCount > 0 ? 'stale_cache' : 'steam_blocked';
  }

  if (
    code === 'INVENTORY_STALE' ||
    params.syncPollTimedOut ||
    (code != null &&
      code !== 'STEAM_PROFILE_PRIVATE' &&
      params.assetsCount === 0)
  ) {
    return 'sync_failed';
  }

  const waitingEmpty =
    params.assetsCount === 0 &&
    (params.loading || Boolean(params.backgroundSyncing));
  if (
    waitingEmpty &&
    (params.emptyWaitMs ?? 0) >= INVENTORY_LOADING_STUCK_MS
  ) {
    return 'loading_stuck';
  }

  if (params.stale && params.assetsCount > 0 && !code) {
    // Soft: stale without explicit Steam block — still offer Steam path.
    return 'stale_cache';
  }

  return null;
}

export function inventorySteamPathCopyKeys(reason: InventorySteamPathReason): {
  titleKey: string;
  bodyKey: string;
  primaryKey: string;
} {
  switch (reason) {
    case 'steam_blocked':
      return {
        titleKey: 'inventory.steamPathBlockedTitle',
        bodyKey: 'inventory.steamPathBlockedBody',
        primaryKey: 'inventory.steamPathOpenSteam',
      };
    case 'loading_stuck':
      return {
        titleKey: 'inventory.steamPathStuckTitle',
        bodyKey: 'inventory.steamPathStuckBody',
        primaryKey: 'inventory.steamPathOpenSteam',
      };
    case 'stale_cache':
      return {
        titleKey: 'inventory.steamPathStaleTitle',
        bodyKey: 'inventory.steamPathStaleBody',
        primaryKey: 'inventory.steamPathOpenSteam',
      };
    default:
      return {
        titleKey: 'inventory.steamPathSyncTitle',
        bodyKey: 'inventory.steamPathSyncBody',
        primaryKey: 'inventory.steamPathOpenSteam',
      };
  }
}
