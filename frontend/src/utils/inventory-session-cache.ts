import type { InventoryAsset, InventorySyncMeta } from '../api/types';

const INVENTORY_SESSION_TTL_MS = 10 * 60 * 1000;
const INVENTORY_SESSION_STORAGE_KEY = 'rip_market_inventory_session';

export type InventorySessionSnapshot = {
  ownerKey: string;
  assets: InventoryAsset[];
  sync: InventorySyncMeta | null;
  savedAt: number;
};

const memory = new Map<string, InventorySessionSnapshot>();

function isFresh(savedAt: number): boolean {
  return Number.isFinite(savedAt) && Date.now() - savedAt <= INVENTORY_SESSION_TTL_MS;
}

export function readInventorySession(
  ownerKey: string,
): InventorySessionSnapshot | null {
  const cached = memory.get(ownerKey);
  if (cached && isFresh(cached.savedAt)) {
    return cached;
  }
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(INVENTORY_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as InventorySessionSnapshot;
    if (parsed.ownerKey !== ownerKey || !isFresh(parsed.savedAt)) {
      return null;
    }
    memory.set(ownerKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeInventorySession(snapshot: InventorySessionSnapshot): void {
  const next = { ...snapshot, savedAt: Date.now() };
  memory.set(snapshot.ownerKey, next);
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(INVENTORY_SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors; memory cache still covers in-tab navigation.
  }
}

export function clearInventorySession(): void {
  memory.clear();
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(INVENTORY_SESSION_STORAGE_KEY);
}
