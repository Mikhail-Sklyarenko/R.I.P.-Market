import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import { getCatalogReturnHref } from '../utils/catalog-return-state';

type LotBreadcrumbsProps = {
  marketHashName: string;
  weapon?: string | null;
  categoryLabel?: string | null;
};

function buildCatalogHref(weapon?: string | null): string {
  if (weapon?.trim()) {
    return `/catalog?weapon=${encodeURIComponent(weapon.trim())}`;
  }
  return '/catalog';
}

export function LotBreadcrumbs({
  marketHashName,
  weapon,
  categoryLabel,
}: LotBreadcrumbsProps) {
  const { t } = useLocale();
  const catalogRootHref = getCatalogReturnHref('/catalog');
  const weaponCatalogHref = getCatalogReturnHref(buildCatalogHref(weapon));
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: t('lotBreadcrumbs.catalog'), href: catalogRootHref },
  ];

  if (categoryLabel?.trim()) {
    crumbs.push({ label: categoryLabel.trim(), href: catalogRootHref });
  }

  if (weapon?.trim()) {
    crumbs.push({ label: weapon.trim(), href: weaponCatalogHref });
  }

  crumbs.push({ label: marketHashName });

  return (
    <nav className="lot-breadcrumbs" aria-label={t('lotBreadcrumbs.navAria')} data-testid="lot-breadcrumbs">
      <ol className="lot-breadcrumbs-list">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={`${crumb.label}-${index}`} className="lot-breadcrumbs-item">
              {crumb.href && !isLast ? (
                <Link to={crumb.href} className="lot-breadcrumbs-link">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'lot-breadcrumbs-current' : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
