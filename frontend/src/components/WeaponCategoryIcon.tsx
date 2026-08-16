import { useEffect, useState } from 'react';
import type { WeaponCategoryIconId } from '../utils/catalog-filters';
import { getWeaponIconTiltClass } from '../utils/weapon-icon-tilt';
import { WeaponIconShell } from './WeaponIconShell';

type WeaponCategoryIconProps = {
  icon: WeaponCategoryIconId;
  className?: string;
};

const CATEGORY_ICON_FILES: Partial<Record<WeaponCategoryIconId, string>> = {
  cases: 'cases',
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
    case 'cases':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4.5 8.2c0-.5.3-.9.8-1l6.2-1.3c.3-.1.6-.1.9 0l6.2 1.3c.5.1.8.5.8 1V9H4.5V8.2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect
            x="4.5"
            y="9"
            width="15"
            height="9.5"
            rx="1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect
            x="10"
            y="12.2"
            width="4"
            height="2.6"
            rx="0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
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
  const classNames = [
    'weapon-category-icon',
    getWeaponIconTiltClass({ icon }),
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const fileSlug = CATEGORY_ICON_FILES[icon];

  useEffect(() => {
    setFailed(false);
  }, [icon]);

  if (!fileSlug || failed) {
    return <FallbackCategoryIcon icon={icon} className={classNames} />;
  }

  return (
    <WeaponIconShell variant="category">
      <img
        src={`/icons/weapons/categories/${fileSlug}.svg`}
        alt=""
        className={classNames}
        width={18}
        height={18}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </WeaponIconShell>
  );
}
