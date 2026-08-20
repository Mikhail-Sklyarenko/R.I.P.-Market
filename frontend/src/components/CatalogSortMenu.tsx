import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from '../i18n';

export type CatalogSortOption = 'newest' | 'price-asc' | 'price-desc' | 'popular';

type CatalogSortMenuProps = {
  sort: CatalogSortOption;
  inStock: boolean;
  onSortChange: (sort: CatalogSortOption) => void;
  onInStockChange: (inStock: boolean) => void;
};

const SORT_OPTIONS: readonly {
  value: CatalogSortOption;
  labelKey:
    | 'catalog.sortPopular'
    | 'catalog.sortNewest'
    | 'catalog.sortPriceAsc'
    | 'catalog.sortPriceDesc';
}[] = [
  { value: 'popular', labelKey: 'catalog.sortPopular' },
  { value: 'newest', labelKey: 'catalog.sortNewest' },
  { value: 'price-asc', labelKey: 'catalog.sortPriceAsc' },
  { value: 'price-desc', labelKey: 'catalog.sortPriceDesc' },
];

/**
 * Catalog toolbar control: sort modes + independent "in stock" filter,
 * styled like ThemeSelect (dark custom menu, not native OS select).
 */
export function CatalogSortMenu({
  sort,
  inStock,
  onSortChange,
  onInStockChange,
}: CatalogSortMenuProps) {
  const { t } = useLocale();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const sortLabel =
    SORT_OPTIONS.find((option) => option.value === sort)?.labelKey ??
    'catalog.sortNewest';
  const triggerLabel = inStock
    ? `${t(sortLabel)} · ${t('catalog.inStock')}`
    : t(sortLabel);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function chooseSort(next: CatalogSortOption) {
    onSortChange(next);
    setOpen(false);
  }

  return (
    <div
      className={`theme-select catalog-sort-menu${open ? ' is-open' : ''}${
        inStock ? ' has-in-stock' : ''
      }`}
      ref={rootRef}
      data-testid="catalog-sort"
      data-sort={sort}
      data-in-stock={inStock ? 'true' : 'false'}
    >
      <button
        type="button"
        className="theme-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={t('catalog.sort')}
        data-testid="catalog-sort-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="theme-select-value">{triggerLabel}</span>
        <span className="theme-select-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listboxId}
          className="theme-select-menu catalog-sort-menu-panel"
          role="listbox"
          aria-label={t('catalog.sort')}
          data-testid="catalog-sort-menu"
        >
          <ul className="catalog-sort-menu-options" role="presentation">
            {SORT_OPTIONS.map((option) => {
              const isActive = option.value === sort;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`theme-select-option${isActive ? ' is-active' : ''}`}
                    data-testid={`catalog-sort-option-${option.value}`}
                    onClick={() => chooseSort(option.value)}
                  >
                    <span>{t(option.labelKey)}</span>
                    {isActive ? (
                      <span className="theme-select-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="catalog-sort-menu-divider" role="separator" />

          <button
            type="button"
            className={`theme-select-option catalog-sort-in-stock${
              inStock ? ' is-active' : ''
            }`}
            role="menuitemcheckbox"
            aria-checked={inStock}
            data-testid="catalog-in-stock-filter"
            onClick={() => onInStockChange(!inStock)}
          >
            <span>{t('catalog.inStock')}</span>
            {inStock ? (
              <span className="theme-select-check" aria-hidden="true">
                ✓
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
