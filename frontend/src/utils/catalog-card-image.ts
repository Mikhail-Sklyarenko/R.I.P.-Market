export type CatalogCardImageProfile = 'default' | 'tall' | 'square';

const TALL_WEAPON_LABELS = new Set(['Agent']);
const SQUARE_WEAPON_LABELS = new Set([
  'Sticker',
  'Sticker Slab',
  'Charm',
  'Patch',
  'Crate',
  'Key',
  'Collectible',
  'Graffiti',
  'Music Kit',
  'Tool',
  'Capsule',
]);

export function resolveCatalogCardImageProfile(item: {
  weapon?: string | null;
  marketHashName: string;
}): CatalogCardImageProfile {
  const weaponLabel = item.weapon?.trim() ?? '';
  if (TALL_WEAPON_LABELS.has(weaponLabel)) {
    return 'tall';
  }
  if (SQUARE_WEAPON_LABELS.has(weaponLabel)) {
    return 'square';
  }

  const lower = item.marketHashName.trim().toLowerCase();
  if (lower.includes(' capsule') || lower.includes(' case') || lower.startsWith('sticker |')) {
    return 'square';
  }
  if (lower.includes(' agent') || lower.startsWith('agent ')) {
    return 'tall';
  }

  return 'default';
}

export function catalogCardImageWrapClass(profile: CatalogCardImageProfile): string {
  if (profile === 'default') {
    return 'catalog-lot-card-image-wrap';
  }
  return `catalog-lot-card-image-wrap catalog-lot-card-image-wrap--${profile}`;
}
