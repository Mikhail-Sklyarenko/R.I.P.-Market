export type InventoryProviderType = 'mock' | 'steam';

export type InventorySyncStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PARTIAL'
  | 'CACHE_HIT';

export type SyncResult = {
  status: InventorySyncStatus;
  itemCount: number;
  /** Exact asset IDs from this live fetch, never reconstructed from local listing state. */
  observedAssetIds?: string[];
  fetchedAt: Date;
  expiresAt: Date;
  cacheHit: boolean;
  stale: boolean;
  errorCode?: string | null;
  warning?: string | null;
};

export type SyncInventoryOptions = {
  force?: boolean;
};

export interface InventoryProvider {
  readonly type: InventoryProviderType;
  syncInventory(
    ownerId: string,
    steamId?: string | null,
    options?: SyncInventoryOptions,
  ): Promise<SyncResult>;
}
