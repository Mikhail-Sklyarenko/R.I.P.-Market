import type { WeaponCategoryIconId } from '../utils/catalog-filters';

type WeaponCategoryIconProps = {
  icon: WeaponCategoryIconId;
  className?: string;
};

export function WeaponCategoryIcon({ icon, className }: WeaponCategoryIconProps) {
  const classNames = ['weapon-category-icon', className].filter(Boolean).join(' ');

  switch (icon) {
    case 'knife':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 19 16 8l3 3L8 22l-3-3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m14 6 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'pistol':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 12h11l2 2h3v2h-3l-2 2H4v-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'rifle':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 12h13l2 2h4v2h-4l-2 2H3v-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M7 10V8h4v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'sniper':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M2 12h16l2 2h4v2h-4l-2 2H2v-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'smg':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 13h10l2 2h3v2h-3l-2 2H5v-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8 11V9h3v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'shotgun':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 12h12l3 3h3v2h-3l-3 3H3v-8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'gloves':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 11V8a2 2 0 0 1 4 0v1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M7 12h10a2 2 0 0 1 2 2v3a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-3a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'other':
      return (
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
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
        <svg className={classNames} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
  }
}
