export type InventoryProviderType = 'mock' | 'steam';

export type InventorySyncStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'CACHE_HIT';

export type SyncResult = {
  status: InventorySyncStatus;
  itemCount: number;
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
