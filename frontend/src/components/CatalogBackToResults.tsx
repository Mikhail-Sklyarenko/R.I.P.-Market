import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n';
import {
  getCatalogReturnHref,
  hasCatalogReturnState,
  isCatalogPath,
} from '../utils/catalog-return-state';

type CatalogBackToResultsProps = {
  className?: string;
};

function CatalogBackIcon() {
  return (
    <svg
      className="catalog-back-to-results-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Quiet return control to the remembered catalog list (filters + page + scroll).
 * Shown on item/lot pages when the shopper arrived from the catalog.
 */
export function CatalogBackToResults({ className }: CatalogBackToResultsProps) {
  const { t } = useLocale();
  const location = useLocation();
  const href = getCatalogReturnHref('/catalog');
  const show = hasCatalogReturnState() && !isCatalogPath(location.pathname);

  if (!show) {
    return null;
  }

  return (
    <div className={`catalog-back-to-results${className ? ` ${className}` : ''}`}>
      <Link
        to={href}
        className="catalog-back-to-results-link"
        data-testid="catalog-back-to-results"
      >
        <CatalogBackIcon />
        <span>{t('lotBreadcrumbs.backToCatalog')}</span>
      </Link>
    </div>
  );
}

/**
 * Header catalog nav that restores the last catalog list when available.
 */
export function CatalogNavLink({
  className,
  children,
  testId,
}: {
  className: string;
  children: ReactNode;
  testId?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <a
      href="/catalog"
      className={className}
      data-testid={testId}
      onClick={(event) => {
        event.preventDefault();
        if (isCatalogPath(location.pathname)) {
          // Already browsing the catalog — keep current filters/scroll.
          return;
        }
        navigate(getCatalogReturnHref('/catalog'));
      }}
    >
      {children}
    </a>
  );
}
