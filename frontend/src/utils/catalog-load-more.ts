import type { CatalogItem } from '../api/types';

export function mergeCatalogItems(
  existing: CatalogItem[],
  incoming: CatalogItem[],
): CatalogItem[] {
  if (incoming.length === 0) {
    return existing;
  }
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      next.push(item);
    }
  }
  return next;
}

export function dedupeCatalogItems(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  const next: CatalogItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    next.push(item);
  }
  return next;
}
