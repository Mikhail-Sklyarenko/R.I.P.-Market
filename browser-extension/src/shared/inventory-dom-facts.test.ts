import { describe, expect, it } from 'vitest';
import {
  applyPlatformNamesToSteamFacts,
  buildDomBaselineSteamFacts,
  createBaselineSteamFact,
  mergeSteamFact,
  mergeSteamFactsMaps,
} from './inventory-dom-facts.js';
import type { InventoryItemPlatformFacts } from './inventory-item-enrichment.js';

describe('inventory-dom-facts', () => {
  it('builds baseline facts from Steam item DOM ids', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="itemHolder">
        <div class="item app730 context2" id="item730_2_111"></div>
      </div>
      <div class="itemHolder">
        <div class="item app730 context2" id="item730_2_222"
          data-market-hash-name="AK-47 | Redline (Field-Tested)"></div>
      </div>
    `;
    const map = buildDomBaselineSteamFacts(root);
    expect(map.size).toBe(2);
    expect(map.get('111')?.tradable).toBe(true);
    expect(map.get('111')?.marketHashName).toBeNull();
    expect(map.get('222')?.marketHashName).toBe(
      'AK-47 | Redline (Field-Tested)',
    );
    expect(map.get('222')?.wear).toBe('FT');
  });

  it('marks context-16 Trade Protected cells as not tradable', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="itemHolder">
        <div class="item" id="730_16_50620552134"
          data-market-hash-name="G3SG1 | Green Cell (Field-Tested)"></div>
      </div>
    `;
    const map = buildDomBaselineSteamFacts(root);
    expect(map.get('50620552134')?.tradable).toBe(false);
    expect(map.get('50620552134')?.tradeLockUntil).toBeTruthy();
  });

  it('merges enrichment onto DOM baseline without dropping CTA defaults', () => {
    const base = createBaselineSteamFact('9');
    const merged = mergeSteamFact(base, {
      assetId: '9',
      marketHashName: 'AWP | Asiimov (Field-Tested)',
      floatValue: '0.25',
      paintSeed: 10,
      wear: 'FT',
      tradable: true,
      marketable: false,
      tradeLockUntil: null,
    });
    expect(merged.floatValue).toBe('0.25');
    expect(merged.marketable).toBe(false);
    expect(merged.marketHashName).toContain('Asiimov');
  });

  it('applies platform market names onto steam facts map', () => {
    const steam = mergeSteamFactsMaps(
      new Map([['a1', createBaselineSteamFact('a1')]]),
    );
    const platform: Record<string, InventoryItemPlatformFacts> = {
      a1: {
        inventoryAssetId: 'uuid',
        assetStatus: 'AVAILABLE',
        marketHashName: 'Fever Case',
        listed: false,
        lotId: null,
        listedPriceMinor: null,
        lotUrl: null,
        inActiveDeal: false,
        hasActiveTradeTask: false,
        orderId: null,
        orderUrl: null,
      },
    };
    const next = applyPlatformNamesToSteamFacts(steam, platform);
    expect(next.get('a1')?.marketHashName).toBe('Fever Case');
  });
});
