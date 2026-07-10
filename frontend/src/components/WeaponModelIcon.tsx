import { useEffect, useState } from 'react';
import type { WeaponCategoryIconId } from '../utils/catalog-filters';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';

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
  const classNames = ['weapon-model-icon', className].filter(Boolean).join(' ');

  useEffect(() => {
    setFailed(false);
  }, [slug]);

  if (!slug || failed) {
    return <WeaponCategoryIcon icon={fallbackIcon} className={classNames} />;
  }

  return (
    <img
      src={`/icons/weapons/${slug}.svg`}
      alt=""
      className={classNames}
      width={20}
      height={20}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
