import { useId, type ReactNode } from 'react';
import { useLocale } from '../i18n';

type CatalogCollapsibleFilterProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  onReset?: () => void;
  showReset?: boolean;
  testId: string;
  children: ReactNode;
};

export function CatalogCollapsibleFilter({
  title,
  open,
  onToggle,
  onReset,
  showReset = false,
  testId,
  children,
}: CatalogCollapsibleFilterProps) {
  const { t } = useLocale();
  const panelId = useId();

  return (
    <section className="catalog-range-filter" data-testid={testId}>
      <div className="catalog-range-filter-header">
        <button
          type="button"
          className="catalog-range-filter-title"
          aria-expanded={open}
          aria-controls={panelId}
          data-testid={`${testId}-toggle`}
          onClick={onToggle}
        >
          {title}
        </button>
        <div className="catalog-range-filter-actions">
          {showReset && onReset ? (
            <button
              type="button"
              className="catalog-range-filter-reset"
              data-testid={`${testId}-reset`}
              onClick={onReset}
            >
              {t('catalog.resetFilter')}
            </button>
          ) : null}
          <button
            type="button"
            className="catalog-range-filter-chevron-btn"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? t('catalog.collapseFilter') : t('catalog.expandFilter')}
            onClick={onToggle}
          >
            <span className="catalog-range-filter-chevron" aria-hidden="true" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="catalog-range-filter-panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
