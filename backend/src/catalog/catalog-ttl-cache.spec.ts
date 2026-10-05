import { TtlLruCache } from './catalog-ttl-cache';

describe('TtlLruCache', () => {
  it('does not restore stale values when a request finishes after clear', async () => {
    const cache = new TtlLruCache<string>(8, 60_000);
    let resolveOld!: (value: string) => void;
    const oldRequest = cache.getOrSet(
      'k',
      () =>
        new Promise<string>((resolve) => {
          resolveOld = resolve;
        }),
    );
    cache.clear();
    await cache.getOrSet('k', async () => 'fresh');
    resolveOld('stale');
    await expect(oldRequest).resolves.toBe('stale');
    expect(cache.get('k')).toBe('fresh');
  });

  it('keeps a new in-flight request when an invalidated request fails', async () => {
    const cache = new TtlLruCache<string>(8, 60_000);
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: string) => void;
    const oldRequest = cache.getOrSet(
      'k',
      () =>
        new Promise<string>((_, reject) => {
          rejectOld = reject;
        }),
    );
    const oldFailure = expect(oldRequest).rejects.toThrow('old request failed');
    cache.clear();
    const freshRequest = cache.getOrSet(
      'k',
      () =>
        new Promise<string>((resolve) => {
          resolveNew = resolve;
        }),
    );
    rejectOld(new Error('old request failed'));
    await oldFailure;
    const duplicateFactory = jest.fn(async () => 'duplicate');
    const joinedRequest = cache.getOrSet('k', duplicateFactory);
    resolveNew('fresh');
    await expect(Promise.all([freshRequest, joinedRequest])).resolves.toEqual([
      'fresh',
      'fresh',
    ]);
    expect(duplicateFactory).not.toHaveBeenCalled();
  });

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
