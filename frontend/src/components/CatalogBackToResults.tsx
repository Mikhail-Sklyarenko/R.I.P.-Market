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

/**
 * Explicit return to the remembered catalog list (filters + page + scroll).
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
        ← {t('lotBreadcrumbs.backToResults')}
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
