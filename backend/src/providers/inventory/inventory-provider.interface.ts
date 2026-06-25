export type InventoryProviderType = 'mock' | 'steam';

export interface InventoryProvider {
  readonly type: InventoryProviderType;
  ensureInventoryForUser(
    ownerId: string,
    steamId?: string | null,
  ): Promise<void>;
}
