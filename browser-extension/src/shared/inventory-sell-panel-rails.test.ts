import { describe, expect, it } from 'vitest';
import { resolveSellPanelPriceRails } from './inventory-sell-panel-rails.js';

describe('inventory-sell-panel-rails', () => {
  it('builds steam / recommended / bid rails without fake instant copy', () => {
    const rails = resolveSellPanelPriceRails({
      steamPriceMinor: 1000,
      suggestedListMinor: 950,
      bestBidMinor: '900',
      bestBidQuantity: 3,
    });
    expect(rails.steamLine).toMatch(/Steam \(lowest\): \$10\.00/);
    expect(rails.recommendedLine).toMatch(/Рекомендуем: \$9\.50/);
    expect(rails.bidLine).toMatch(/bid/i);
    expect(rails.bidLine).toMatch(/3 шт/);
    expect(rails.honestyLine).toMatch(/не мгновенная/i);
    expect(JSON.stringify(rails)).not.toMatch(/моментал/i);
  });

  it('shows Steam median only when distinct from lowest', () => {
    const withMedian = resolveSellPanelPriceRails({
      steamPriceMinor: 1000,
      steamMedianPriceMinor: 1100,
    });
    expect(withMedian.medianLine).toMatch(/Средняя Steam: \$11\.00/);

    const same = resolveSellPanelPriceRails({
      steamPriceMinor: 1000,
      steamMedianPriceMinor: 1000,
    });
    expect(same.medianLine).toBeNull();
  });
});
