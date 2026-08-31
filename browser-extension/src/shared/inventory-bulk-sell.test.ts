import { describe, expect, it } from 'vitest';
import {
  buildBulkProgress,
  buildBulkSellItem,
  canSelectForBulkSell,
  formatBulkListingPreview,
  isFungibleSteamFacts,
  MAX_BULK_LISTING_COUNT,
  planBulkSellOperations,
  toggleBulkSelection,
  validateBulkSelectionForSubmit,
} from './inventory-bulk-sell.js';

describe('inventory-bulk-sell', () => {
  const fungibleSteam = {
    assetId: '1',
    marketHashName: 'Fever Case',
    floatValue: null,
    paintSeed: null,
    wear: null,
    tradable: true,
    marketable: true,
    tradeLockUntil: null,
  };

  const skinSteam = {
    ...fungibleSteam,
    assetId: '2',
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    floatValue: '0.25',
    paintSeed: 661,
    wear: 'FT',
  };

  it('formats unique skin names for the confirm modal', () => {
    const preview = formatBulkListingPreview(
      [
        'AK-47 | Redline (Field-Tested)',
        'Glock-18 | Water Elemental (Minimal Wear)',
        'AK-47 | Redline (Field-Tested)',
        'USP-S | Kill Confirmed (Factory New)',
      ],
      2,
    );
    expect(preview.uniqueCount).toBe(3);
    expect(preview.lines).toEqual([
      'AK-47 | Redline (Field-Tested)',
      'Glock-18 | Water Elemental (Minimal Wear)',
    ]);
    expect(preview.moreCount).toBe(1);
  });

  it('detects fungible vs differentiated', () => {
    expect(isFungibleSteamFacts(fungibleSteam)).toBe(true);
    expect(isFungibleSteamFacts(skinSteam)).toBe(false);
  });

  it('gates selection to listable connected items', () => {
    expect(
      canSelectForBulkSell({
        connected: true,
        steam: fungibleSteam,
        platform: null,
      }),
    ).toBe(true);
    expect(
      canSelectForBulkSell({
        connected: false,
        steam: fungibleSteam,
      }),
    ).toBe(false);
    expect(
      canSelectForBulkSell({
        connected: true,
        steam: fungibleSteam,
        platform: {
          inventoryAssetId: 'u1',
          assetStatus: 'LISTED',
          listed: true,
          lotId: 'l1',
          listedPriceMinor: '100',
          lotUrl: 'https://p2pcs.ru/lots/l1',
          inActiveDeal: false,
          hasActiveTradeTask: false,
          orderId: null,
          orderUrl: null,
        },
      }),
    ).toBe(false);
  });

  it('plans platform bulk for identical fungibles', () => {
    const items = [1, 2, 3].map((id) =>
      buildBulkSellItem({
        steam: { ...fungibleSteam, assetId: String(id) },
        platform: {
          inventoryAssetId: `uuid-${id}`,
          assetStatus: 'AVAILABLE',
          listed: false,
          lotId: null,
          listedPriceMinor: null,
          lotUrl: null,
          inActiveDeal: false,
          hasActiveTradeTask: false,
          orderId: null,
          orderUrl: null,
        },
      }),
    );
    const plan = planBulkSellOperations(items.filter(Boolean) as never);
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.type).toBe('platform_bulk');
    expect(plan.modeLabel).toMatch(/Пакет/);
  });

  it('plans sequential for differentiated skins', () => {
    const items = [1, 2].map((id) =>
      buildBulkSellItem({
        steam: {
          ...skinSteam,
          assetId: String(id),
          floatValue: `0.2${id}`,
        },
      }),
    );
    const plan = planBulkSellOperations(items.filter(Boolean) as never);
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.type).toBe('sequential');
    expect(plan.operations[0]?.items).toHaveLength(2);
  });

  it('mixes bulk + sequential and truncates at max', () => {
    const cases = Array.from({ length: 3 }, (_, i) =>
      buildBulkSellItem({
        steam: { ...fungibleSteam, assetId: `c${i}` },
      }),
    );
    const skins = Array.from({ length: MAX_BULK_LISTING_COUNT }, (_, i) =>
      buildBulkSellItem({
        steam: {
          ...skinSteam,
          assetId: `s${i}`,
          floatValue: `0.${String(i).padStart(2, '0')}`,
        },
      }),
    );
    const plan = planBulkSellOperations(
      [...cases, ...skins].filter(Boolean) as never,
    );
    expect(plan.truncated).toBe(true);
    expect(plan.plannedCount).toBe(MAX_BULK_LISTING_COUNT);
  });

  it('validates selection count and toggles with cap', () => {
    expect(validateBulkSelectionForSubmit(1)).toMatch(/минимум/i);
    expect(validateBulkSelectionForSubmit(2)).toBeNull();

    let selected = new Set<string>();
    selected = toggleBulkSelection(selected, 'a', true);
    expect(selected.has('a')).toBe(true);
    for (let i = 0; i < MAX_BULK_LISTING_COUNT; i += 1) {
      selected = toggleBulkSelection(selected, `id-${i}`, true);
    }
    expect(selected.size).toBe(MAX_BULK_LISTING_COUNT);
    const blocked = toggleBulkSelection(selected, 'overflow', true);
    expect(blocked.has('overflow')).toBe(false);
  });

  it('builds progress labels', () => {
    expect(
      buildBulkProgress({ total: 5, done: 3, created: 2, failed: 1 }).label,
    ).toMatch(/2 из 5/);
  });
});
