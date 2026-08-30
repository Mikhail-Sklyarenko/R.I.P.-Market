import { describe, expect, it } from 'vitest';
import {
  countTradeHoldOrUntradable,
  dismissTradeHoldBanner,
  formatTradeHoldBadgeLabel,
  isTradeHoldBannerDismissed,
  readSteamItemIconUrl,
  resolveTradeHoldBannerView,
  TRADE_HOLD_BANNER_DISMISS_KEY,
} from './inventory-trade-hold.js';
import type { InventoryItemSteamFacts } from './inventory-item-enrichment.js';

function fact(
  partial: Partial<InventoryItemSteamFacts> & { assetId: string },
): InventoryItemSteamFacts {
  return {
    marketHashName: null,
    floatValue: null,
    paintSeed: null,
    wear: null,
    tradable: true,
    marketable: true,
    tradeLockUntil: null,
    ...partial,
  };
}

describe('inventory-trade-hold', () => {
  it('formats human Hold badges', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    expect(formatTradeHoldBadgeLabel('2026-08-28T12:00:00.000Z', now)).toBe(
      'Hold · 2 дн',
    );
    expect(formatTradeHoldBadgeLabel('2026-08-26T18:00:00.000Z', now)).toBe(
      'Hold · 6 ч',
    );
  });

  it('counts hold / untradable and builds banner', () => {
    const facts = [
      fact({ assetId: '1', tradeLockUntil: '2099-01-01T00:00:00.000Z' }),
      fact({ assetId: '2', tradable: false }),
      fact({ assetId: '3', tradable: true }),
    ];
    expect(countTradeHoldOrUntradable(facts)).toBe(2);
    const banner = resolveTradeHoldBannerView({
      facts,
      dismissed: false,
    });
    expect(banner.visible).toBe(true);
    expect(banner.body).toMatch(/2 предмет/i);
    expect(
      resolveTradeHoldBannerView({ facts, dismissed: true }).visible,
    ).toBe(false);
  });

  it('persists dismiss in session-like storage', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    expect(isTradeHoldBannerDismissed(storage)).toBe(false);
    dismissTradeHoldBanner(storage);
    expect(mem.get(TRADE_HOLD_BANNER_DISMISS_KEY)).toBe('1');
    expect(isTradeHoldBannerDismissed(storage)).toBe(true);
  });

  it('reads icon url from steam item img', () => {
    const root = document.implementation.createHTMLDocument();
    root.body.innerHTML = `
      <div class="item" id="item730_2_99">
        <img src="https://cdn.example/icon.png" alt="skin" />
      </div>`;
    const item = root.body.querySelector('.item');
    expect(
      readSteamItemIconUrl(root, '99', () => item),
    ).toBe('https://cdn.example/icon.png');
  });
});
