export type SavedItem = { id: string; ref: string; name: string };
export const SAVED_ITEMS_EVENT = 'rip:saved-items';
export function savedItemsKey(userId?: string | null): string { return `rip:saved-items:${userId ?? 'guest'}`; }
export function parseSavedItems(raw: string | null): SavedItem[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.filter((x): x is SavedItem => {
      if (!x || typeof x.id !== 'string' || typeof x.ref !== 'string' || typeof x.name !== 'string' || !x.id || !x.ref || x.name.length > 200 || seen.has(x.id)) return false;
      seen.add(x.id); return true;
    }).slice(0, 100).map(({id, ref, name}) => ({id, ref, name}));
  } catch { return []; }
}
export function readSavedItems(userId?: string | null): SavedItem[] {
  try { return parseSavedItems(localStorage.getItem(savedItemsKey(userId))); } catch { return []; }
}
export function toggleSavedItem(item: SavedItem, userId?: string | null): boolean {
  const items = readSavedItems(userId);
  const exists = items.some(i => i.id === item.id);
  if (!exists && items.length >= 100) return false;
  const next = exists ? items.filter(i => i.id !== item.id) : [item, ...items];
  try {
    localStorage.setItem(savedItemsKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(SAVED_ITEMS_EVENT));
    return true;
  } catch { return false; }
}
