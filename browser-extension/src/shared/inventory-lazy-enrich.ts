/**
 * H2: Inventory overlay performance — viewport-aware enrich batches.
 * Avoid sync work across 1k+ Steam item holders.
 */

export const LAZY_ENRICH_VIEWPORT_MARGIN_PX = 240;
export const LAZY_ENRICH_SYNC_CAP = 48;
export const LAZY_ENRICH_BATCH_SIZE = 24;

export type HolderRectLike = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function isRectNearViewport(
  rect: HolderRectLike,
  viewport: { width: number; height: number },
  marginPx = LAZY_ENRICH_VIEWPORT_MARGIN_PX,
): boolean {
  return !(
    rect.bottom < -marginPx ||
    rect.top > viewport.height + marginPx ||
    rect.right < -marginPx ||
    rect.left > viewport.width + marginPx
  );
}

export function isElementNearViewport(
  el: Element,
  opts?: {
    marginPx?: number;
    viewport?: { width: number; height: number };
    getBoundingClientRect?: (node: Element) => HolderRectLike;
  },
): boolean {
  const viewport = opts?.viewport ?? {
    width:
      typeof window !== 'undefined'
        ? window.innerWidth || document.documentElement.clientWidth || 0
        : 0,
    height:
      typeof window !== 'undefined'
        ? window.innerHeight || document.documentElement.clientHeight || 0
        : 0,
  };
  const getRect =
    opts?.getBoundingClientRect ??
    ((node: Element) => node.getBoundingClientRect());
  return isRectNearViewport(
    getRect(el),
    viewport,
    opts?.marginPx ?? LAZY_ENRICH_VIEWPORT_MARGIN_PX,
  );
}

/**
 * Split holders into immediate (near viewport, capped) vs deferred.
 * Order preserved: first N near-viewport, then rest deferred.
 */
export function partitionHoldersForEnrich<T extends Element>(
  holders: T[],
  opts?: {
    syncCap?: number;
    marginPx?: number;
    viewport?: { width: number; height: number };
    getBoundingClientRect?: (node: Element) => HolderRectLike;
  },
): { immediate: T[]; deferred: T[] } {
  const syncCap = opts?.syncCap ?? LAZY_ENRICH_SYNC_CAP;
  const near: T[] = [];
  const far: T[] = [];
  for (const holder of holders) {
    if (
      isElementNearViewport(holder, {
        marginPx: opts?.marginPx,
        viewport: opts?.viewport,
        getBoundingClientRect: opts?.getBoundingClientRect,
      })
    ) {
      near.push(holder);
    } else {
      far.push(holder);
    }
  }
  if (near.length <= syncCap) {
    return { immediate: near, deferred: far };
  }
  return {
    immediate: near.slice(0, syncCap),
    deferred: [...near.slice(syncCap), ...far],
  };
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunkSize = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
