import { useEffect, useState } from 'react';
import type { WeaponCategoryIconId } from '../utils/catalog-filters';
import {
  CATALOG_MODEL_PREVIEW_SIZE_PX,
  getCatalogModelPreviewHash,
} from '../utils/catalog-model-preview-icons';
import { getSteamItemImageUrl } from '../utils/item-image';
import { getWeaponIconTiltClass } from '../utils/weapon-icon-tilt';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';
import { WeaponIconShell } from './WeaponIconShell';

type WeaponModelIconProps = {
  /** Exact ItemDefinition.weapon label — used for Steam skin preview. */
  weapon?: string;
  slug?: string;
  fallbackIcon?: WeaponCategoryIconId;
  className?: string;
  /** Prefer eager load for the open dropdown / selected tab chip. */
  loading?: 'lazy' | 'eager';
};

export function WeaponModelIcon({
  weapon,
  slug,
  fallbackIcon = 'other',
  className,
  loading = 'lazy',
}: WeaponModelIconProps) {
  const previewHash = getCatalogModelPreviewHash(weapon);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [svgFailed, setSvgFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
    setSvgFailed(false);
  }, [weapon, slug, previewHash]);

  const usePreview = Boolean(previewHash) && !previewFailed;
  const classNames = [
    'weapon-model-icon',
    usePreview ? 'weapon-model-icon-preview' : getWeaponIconTiltClass({ slug, fallbackIcon }),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (usePreview && previewHash) {
    return (
      <WeaponIconShell variant="model">
        <img
          src={getSteamItemImageUrl(previewHash, {
            sizePx: CATALOG_MODEL_PREVIEW_SIZE_PX,
          })}
          alt=""
          className={classNames}
          width={CATALOG_MODEL_PREVIEW_SIZE_PX}
          height={CATALOG_MODEL_PREVIEW_SIZE_PX}
          loading={loading}
          decoding="async"
          data-testid={weapon ? `weapon-model-preview-${slugify(weapon)}` : undefined}
          onError={() => setPreviewFailed(true)}
        />
      </WeaponIconShell>
    );
  }

  if (!slug || svgFailed) {
    return <WeaponCategoryIcon icon={fallbackIcon} className={classNames} />;
  }

  return (
    <WeaponIconShell variant="model">
      <img
        src={`/icons/weapons/${slug}.svg`}
        alt=""
        className={classNames}
        width={20}
        height={20}
        loading={loading}
        onError={() => setSvgFailed(true)}
      />
    </WeaponIconShell>
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Warm browser cache for dropdown preview thumbs when a tab opens. */
export function prefetchCatalogModelPreviews(weapons: readonly string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  for (const weapon of weapons) {
    const hash = getCatalogModelPreviewHash(weapon);
    if (!hash) {
      continue;
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = getSteamItemImageUrl(hash, { sizePx: CATALOG_MODEL_PREVIEW_SIZE_PX });
  }
}
