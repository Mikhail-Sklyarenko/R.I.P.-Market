import {
  isUuid,
  resolveUniqueItemSlug,
  slugifyMarketHashName,
} from './item-slug.util';

describe('item-slug util', () => {
  it('slugifies market hash names', () => {
    expect(slugifyMarketHashName('AK-47 | Redline')).toBe('ak-47-redline');
    expect(slugifyMarketHashName('AK-47 | Redline (Field-Tested)')).toBe(
      'ak-47-redline-field-tested',
    );
  });

  it('detects uuid refs', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('ak-47-redline')).toBe(false);
  });

  it('resolves slug collisions with numeric suffix', () => {
    const reserved = new Set(['ak-47-redline']);
    expect(resolveUniqueItemSlug('AK-47 | Redline', reserved)).toBe('ak-47-redline-2');
  });
});
