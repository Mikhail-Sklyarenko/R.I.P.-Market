import { useEffect, useState } from 'react';
import type { WeaponCategoryIconId } from '../utils/catalog-filters';

type WeaponCategoryIconProps = {
  icon: WeaponCategoryIconId;
  className?: string;
};

const CATEGORY_ICON_FILES: Partial<Record<WeaponCategoryIconId, string>> = {
  knife: 'knife',
  pistol: 'pistol',
  rifle: 'rifle',
  sniper: 'sniper',
  smg: 'smg',
  shotgun: 'shotgun',
  gloves: 'gloves',
};

function FallbackCategoryIcon({
  icon,
  className,
}: {
  icon: WeaponCategoryIconId;
  className: string;
}) {
  switch (icon) {
    case 'other':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
  }
}

export function WeaponCategoryIcon({ icon, className }: WeaponCategoryIconProps) {
  const [failed, setFailed] = useState(false);
  const classNames = ['weapon-category-icon', className].filter(Boolean).join(' ');
  const fileSlug = CATEGORY_ICON_FILES[icon];

  useEffect(() => {
    setFailed(false);
  }, [icon]);

  if (!fileSlug || failed) {
    return <FallbackCategoryIcon icon={icon} className={classNames} />;
  }

  return (
    <img
      src={`/icons/weapons/categories/${fileSlug}.svg`}
      alt=""
      className={classNames}
      width={18}
      height={18}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
