import type { InventorySyncMeta } from '../api/types';

export type InventoryEmptyKind = 'private' | 'syncFailed' | 'tradableEmpty';

export function resolveInventoryEmptyKind(
  sync: InventorySyncMeta | null | undefined,
  options?: {
    syncPollTimedOut?: boolean;
    backgroundSyncing?: boolean;
  },
): InventoryEmptyKind {
  if (sync?.errorCode === 'STEAM_PROFILE_PRIVATE') {
    return 'private';
  }

  if (
    sync?.errorCode === 'STEAM_BLOCKED' ||
    sync?.errorCode === 'INVENTORY_STALE' ||
    options?.syncPollTimedOut
  ) {
    return 'syncFailed';
  }

  if (sync?.errorCode) {
    return 'syncFailed';
  }

  return 'tradableEmpty';
}

export function inventoryEmptyKindMessageKeys(kind: InventoryEmptyKind): {
  titleKey: string;
  messageKey: string;
} {
  switch (kind) {
    case 'private':
      return {
        titleKey: 'inventory.emptyPrivateTitle',
        messageKey: 'inventory.emptyPrivateMessage',
      };
    case 'syncFailed':
      return {
        titleKey: 'inventory.emptySyncTitle',
        messageKey: 'inventory.emptySyncMessage',
      };
    default:
      return {
        titleKey: 'inventory.emptyTradableTitle',
        messageKey: 'inventory.emptyTradableMessage',
      };
  }
}
