import { useEffect, useState } from 'react';
import type { WeaponCategoryIconId } from '../utils/catalog-filters';
import { getWeaponIconTiltClass } from '../utils/weapon-icon-tilt';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';
import { WeaponIconShell } from './WeaponIconShell';

type WeaponModelIconProps = {
  slug?: string;
  fallbackIcon?: WeaponCategoryIconId;
  className?: string;
};

export function WeaponModelIcon({
  slug,
  fallbackIcon = 'other',
  className,
}: WeaponModelIconProps) {
  const [failed, setFailed] = useState(false);
  const classNames = [
    'weapon-model-icon',
    getWeaponIconTiltClass({ slug, fallbackIcon }),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    setFailed(false);
  }, [slug]);

  if (!slug || failed) {
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
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </WeaponIconShell>
  );
}
