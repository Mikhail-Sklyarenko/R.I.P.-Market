/**
 * Depth mode for the item page (how many active listings).
 * Market kind (fungible vs differentiated) lives in `item-market-taxonomy`.
 */
export type ItemPageMode = 'buy-request' | 'single-listing' | 'comparison';

export function resolveItemPageMode(activeLotCount: number): ItemPageMode {
  if (activeLotCount <= 0) {
    return 'buy-request';
  }
  if (activeLotCount === 1) {
    return 'single-listing';
  }
  return 'comparison';
}
