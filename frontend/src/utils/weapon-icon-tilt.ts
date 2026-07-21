import type { WeaponCategoryIconId } from './catalog-filters';

export type WeaponIconTiltId =
  | 'none'
  | 'knife'
  | 'pistol'
  | 'rifle'
  | 'sniper'
  | 'smg'
  | 'shotgun';

const CATEGORY_TILT: Partial<Record<WeaponCategoryIconId, WeaponIconTiltId>> = {
  knife: 'knife',
  pistol: 'pistol',
  rifle: 'rifle',
  sniper: 'sniper',
  smg: 'smg',
  shotgun: 'shotgun',
  gloves: 'none',
  all: 'none',
  other: 'none',
};

const MODEL_TILT: Partial<Record<string, WeaponIconTiltId>> = {
  karambit: 'knife',
  bayonet: 'knife',
  'm9-bayonet': 'knife',
  'butterfly-knife': 'knife',
  'bowie-knife': 'knife',
  'shadow-daggers': 'knife',
  'talon-knife': 'knife',
  'skeleton-knife': 'knife',
  'sport-gloves': 'none',
  'hand-wraps': 'none',
  'driver-gloves': 'none',
  'specialist-gloves': 'none',
  'moto-gloves': 'none',
  'hydra-gloves': 'none',
  'bloodhound-gloves': 'none',
  'broken-fang-gloves': 'none',
};

export function resolveWeaponIconTilt(input: {
  icon?: WeaponCategoryIconId;
  slug?: string;
  fallbackIcon?: WeaponCategoryIconId;
}): WeaponIconTiltId {
  if (input.slug && MODEL_TILT[input.slug]) {
    return MODEL_TILT[input.slug]!;
  }

  if (input.icon && CATEGORY_TILT[input.icon]) {
    return CATEGORY_TILT[input.icon]!;
  }

  if (input.fallbackIcon && CATEGORY_TILT[input.fallbackIcon]) {
    return CATEGORY_TILT[input.fallbackIcon]!;
  }

  return 'none';
}

export function getWeaponIconTiltClass(input: {
  icon?: WeaponCategoryIconId;
  slug?: string;
  fallbackIcon?: WeaponCategoryIconId;
}): string {
  return `weapon-icon-tilt-${resolveWeaponIconTilt(input)}`;
}
