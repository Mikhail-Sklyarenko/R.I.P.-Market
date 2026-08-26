import { describe, expect, it } from 'vitest';
import {
  chunkArray,
  isRectNearViewport,
  LAZY_ENRICH_SYNC_CAP,
  partitionHoldersForEnrich,
} from './inventory-lazy-enrich.js';

describe('inventory-lazy-enrich', () => {
  it('detects near-viewport rects with margin', () => {
    const viewport = { width: 800, height: 600 };
    expect(
      isRectNearViewport({ top: 100, bottom: 200, left: 10, right: 100 }, viewport),
    ).toBe(true);
    expect(
      isRectNearViewport(
        { top: 2000, bottom: 2100, left: 10, right: 100 },
        viewport,
        240,
      ),
    ).toBe(false);
  });

  it('caps immediate enrich and defers the rest', () => {
    const holders = Array.from({ length: 120 }, (_, i) => {
      const el = document.createElement('div');
      el.dataset.i = String(i);
      return el;
    });
    const { immediate, deferred } = partitionHoldersForEnrich(holders, {
      syncCap: 40,
      viewport: { width: 800, height: 600 },
      getBoundingClientRect: (node) => {
        const i = Number((node as HTMLElement).dataset.i ?? 0);
        // First 60 near viewport, rest far.
        if (i < 60) {
          return { top: 10, bottom: 50, left: 0, right: 40 };
        }
        return { top: 5000, bottom: 5050, left: 0, right: 40 };
      },
    });
    expect(immediate).toHaveLength(40);
    expect(deferred).toHaveLength(80);
    expect(immediate[0]?.dataset.i).toBe('0');
    expect(deferred[0]?.dataset.i).toBe('40');
  });

  it('uses default sync cap', () => {
    expect(LAZY_ENRICH_SYNC_CAP).toBe(48);
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
