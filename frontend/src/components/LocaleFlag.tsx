import type { Locale } from '../i18n';

type LocaleFlagProps = {
  locale: Locale;
  className?: string;
  title?: string;
};

/** Vector flags — never rely on OS emoji fonts (Windows often shows "RU"/"US" letters). */
export function LocaleFlag({ locale, className, title }: LocaleFlagProps) {
  if (locale === 'ru') {
    return (
      <svg
        className={className}
        width="18"
        height="12"
        viewBox="0 0 18 12"
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        focusable="false"
      >
        {title ? <title>{title}</title> : null}
        <rect width="18" height="12" rx="1.5" fill="#fff" />
        <rect y="4" width="18" height="4" fill="#0039A6" />
        <rect y="8" width="18" height="4" fill="#D52B1E" />
        <rect
          x="0.25"
          y="0.25"
          width="17.5"
          height="11.5"
          rx="1.35"
          fill="none"
          stroke="rgba(15, 23, 42, 0.35)"
          strokeWidth="0.5"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      width="18"
      height="12"
      viewBox="0 0 18 12"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <rect width="18" height="12" rx="1.5" fill="#B22234" />
      <rect y="0.92" width="18" height="0.92" fill="#fff" />
      <rect y="2.77" width="18" height="0.92" fill="#fff" />
      <rect y="4.62" width="18" height="0.92" fill="#fff" />
      <rect y="6.46" width="18" height="0.92" fill="#fff" />
      <rect y="8.31" width="18" height="0.92" fill="#fff" />
      <rect y="10.15" width="18" height="0.92" fill="#fff" />
      <rect width="7.4" height="6.5" fill="#3C3B6E" />
      <rect
        x="0.25"
        y="0.25"
        width="17.5"
        height="11.5"
        rx="1.35"
        fill="none"
        stroke="rgba(15, 23, 42, 0.35)"
        strokeWidth="0.5"
      />
    </svg>
  );
}
