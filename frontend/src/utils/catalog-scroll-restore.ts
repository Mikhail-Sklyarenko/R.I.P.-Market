import {
  catalogMainGridItemSelector,
  type CatalogReturnRestore,
} from './catalog-return-state.ts';

export type CatalogScrollRestoreResult = 'anchored' | 'scrolled';

function isAnchorInView(anchor: HTMLElement): boolean {
  const rect = anchor.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.9 && rect.bottom > window.innerHeight * 0.1;
}

/**
 * Restore catalog list position before the browser paints.
 * Prefers the remembered card; always applies scrollY so the user never sees the top first.
 */
export function applyCatalogScrollRestore(
  restore: CatalogReturnRestore,
): CatalogScrollRestoreResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'scrolled';
  }

  if (restore.anchorItemId) {
    const anchor = document.querySelector(
      catalogMainGridItemSelector(restore.anchorItemId),
    ) as HTMLElement | null;
    if (anchor) {
      anchor.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (!isAnchorInView(anchor)) {
        window.scrollTo({ top: restore.scrollY, behavior: 'instant' });
      }
      return 'anchored';
    }
  }

  window.scrollTo({ top: restore.scrollY, behavior: 'instant' });
  return 'scrolled';
}

export function disableBrowserScrollRestoration(): void {
  if (typeof window === 'undefined' || !('scrollRestoration' in window.history)) {
    return;
  }
  window.history.scrollRestoration = 'manual';
}
