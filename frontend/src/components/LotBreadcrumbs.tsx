import { Link } from 'react-router-dom';

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
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: 'Каталог', href: '/catalog' },
  ];

  if (categoryLabel?.trim()) {
    crumbs.push({ label: categoryLabel.trim(), href: '/catalog' });
  }

  if (weapon?.trim()) {
    crumbs.push({ label: weapon.trim(), href: buildCatalogHref(weapon) });
  }

  crumbs.push({ label: marketHashName });

  return (
    <nav className="lot-breadcrumbs" aria-label="Навигация по каталогу" data-testid="lot-breadcrumbs">
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
