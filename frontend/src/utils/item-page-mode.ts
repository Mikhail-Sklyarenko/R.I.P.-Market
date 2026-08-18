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
