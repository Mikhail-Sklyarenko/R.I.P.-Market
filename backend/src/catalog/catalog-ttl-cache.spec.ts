import { TtlLruCache } from './catalog-ttl-cache';

describe('TtlLruCache', () => {
  it('returns cached value within TTL and evicts oldest entries', async () => {
    const cache = new TtlLruCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('dedupes in-flight factory calls', async () => {
    const cache = new TtlLruCache<string>(8, 60_000);
    let calls = 0;

    const first = cache.getOrSet('k', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'ok';
    });
    const second = cache.getOrSet('k', async () => {
      calls += 1;
      return 'other';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok']);
    expect(calls).toBe(1);
  });
});
