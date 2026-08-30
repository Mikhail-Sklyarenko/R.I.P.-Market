import { describe, expect, it } from 'vitest';
import {
  buildBrowserAssistAssetsFromFacts,
  MAX_BROWSER_ASSIST_ASSETS,
} from './inventory-browser-assist.js';

describe('inventory-browser-assist', () => {
  it('skips facts without market hash name and caps payload size', () => {
    const facts = Array.from({ length: MAX_BROWSER_ASSIST_ASSETS + 5 }, (_, i) => ({
      assetId: String(i + 1),
      marketHashName: i === 0 ? null : `Item ${i}`,
      floatValue: null,
      paintSeed: null,
      wear: null,
      tradable: true,
      marketable: true,
      tradeLockUntil: null,
    }));
    const assets = buildBrowserAssistAssetsFromFacts(facts);
    expect(assets).toHaveLength(MAX_BROWSER_ASSIST_ASSETS);
    expect(assets[0]?.marketHashName).toBe('Item 1');
  });
});
