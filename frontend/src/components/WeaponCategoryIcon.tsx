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
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <g fill="currentColor">
            <path d="M22.8 12.1 26.4 10.6V24.1l-3.6 1.5V12.1z" opacity="0.52" />
            <path d="M5.6 10.8 16 7.3l10.4 3.5-10.4 3.3L5.6 10.8z" />
            <path d="M5.6 10.8h18.8v1.55H5.6V10.8z" opacity="0.82" />
            <path d="M5.6 12.35h17.2v12.25c0 .95-.77 1.72-1.72 1.72H7.32c-.95 0-1.72-.77-1.72-1.72V12.35z" />
            <rect x="12.55" y="17.75" width="6.9" height="3.55" rx="0.85" />
          </g>
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
