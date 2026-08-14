const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SLUG_LENGTH = 120;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Stable URL slug from Steam market_hash_name. */
export function slugifyMarketHashName(marketHashName: string): string {
  const slug = marketHashName
    .trim()
    .toLowerCase()
    .replace(/[™®]/g, '')
    .replace(/\s*\|\s*/g, '-')
    .replace(/\s*\(\s*/g, '-')
    .replace(/\s*\)\s*/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    return 'item';
  }

  return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '') : slug;
}

export function resolveUniqueItemSlug(
  marketHashName: string,
  reserved: ReadonlySet<string>,
): string {
  const base = slugifyMarketHashName(marketHashName);
  if (!reserved.has(base)) {
    return base;
  }

  let index = 2;
  while (reserved.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
