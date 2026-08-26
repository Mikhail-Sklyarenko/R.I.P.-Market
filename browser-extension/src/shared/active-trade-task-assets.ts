export const ACTIVE_TRADE_TASK_ASSETS_KEY = 'rip:activeTradeTaskAssets';

export type ActiveTradeTaskAssetEntry = {
  orderId: string;
  taskId: string;
  siteUrl: string | null;
};

export type ActiveTradeTaskAssetsCache = {
  updatedAt: string;
  byAssetId: Record<string, ActiveTradeTaskAssetEntry>;
};

const TERMINAL_PHASES = new Set([
  'OFFER_SENT',
  'OFFER_FAILED',
]);

export function collectActiveTradeTaskAssets(
  tasks: Array<{
    id: string;
    orderId?: string | null;
    executionPhase?: string | null;
    payload?: {
      expectedAssetId?: string | null;
      orderId?: string | null;
    } | null;
  }>,
  siteOrigin: string,
): Record<string, ActiveTradeTaskAssetEntry> {
  const byAssetId: Record<string, ActiveTradeTaskAssetEntry> = {};
  for (const task of tasks) {
    if (task.executionPhase && TERMINAL_PHASES.has(task.executionPhase)) {
      continue;
    }
    const assetId = String(task.payload?.expectedAssetId ?? '').trim();
    if (!assetId) {
      continue;
    }
    const orderId = String(task.orderId ?? task.payload?.orderId ?? '').trim();
    byAssetId[assetId] = {
      orderId,
      taskId: task.id,
      siteUrl: orderId ? `${siteOrigin.replace(/\/$/, '')}/orders/${orderId}` : null,
    };
  }
  return byAssetId;
}

export async function getActiveTradeTaskAssetsCache(): Promise<ActiveTradeTaskAssetsCache | null> {
  const stored = await chrome.storage.session.get(ACTIVE_TRADE_TASK_ASSETS_KEY);
  const cache = stored[ACTIVE_TRADE_TASK_ASSETS_KEY] as
    | ActiveTradeTaskAssetsCache
    | undefined;
  return cache ?? null;
}

export async function setActiveTradeTaskAssetsCache(
  byAssetId: Record<string, ActiveTradeTaskAssetEntry>,
): Promise<void> {
  const cache: ActiveTradeTaskAssetsCache = {
    updatedAt: new Date().toISOString(),
    byAssetId,
  };
  await chrome.storage.session.set({ [ACTIVE_TRADE_TASK_ASSETS_KEY]: cache });
}
