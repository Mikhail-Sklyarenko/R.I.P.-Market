import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';

export type InventoryLoadResult = {
  items: SteamInventoryItem[];
  rateLimited: boolean;
};

export function emptyInventoryLoadResult(): InventoryLoadResult {
  return { items: [], rateLimited: false };
}

export function isRateLimitedError(error: unknown): boolean {
  return error instanceof Error && /HTTP 429/.test(error.message);
}
