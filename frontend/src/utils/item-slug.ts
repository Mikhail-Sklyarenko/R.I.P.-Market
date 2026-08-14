const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

type CatalogItemRef = {
  id: string;
  slug?: string | null;
};

/** Prefer SEO slug in URLs; fall back to UUID when slug is missing. */
export function getCatalogItemRef(item: CatalogItemRef): string {
  return item.slug?.trim() || item.id;
}
