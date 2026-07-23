import { useState } from 'react';
import { useLocale } from '../i18n';
import { CatalogCollapsibleFilter } from './CatalogCollapsibleFilter';
import { CatalogRangeFieldCell } from './CatalogRangeFieldCell';

type CatalogPriceRangeFilterProps = {
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  defaultOpen?: boolean;
};

export function CatalogPriceRangeFilter({
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  defaultOpen = false,
}: CatalogPriceRangeFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useLocale();

  return (
    <CatalogCollapsibleFilter
      title={t('catalog.price')}
      open={open}
      onToggle={() => setOpen((current) => !current)}
      testId="catalog-price-filter"
    >
      <div className="catalog-range-field-row">
        <CatalogRangeFieldCell
          label={t('catalog.priceFrom')}
          value={minPrice}
          onChange={onMinPriceChange}
          testId="catalog-min-price"
          prefix="$"
          inputMode="decimal"
        />
        <div className="catalog-range-field-divider" aria-hidden="true" />
        <CatalogRangeFieldCell
          label={t('catalog.priceTo')}
          value={maxPrice}
          onChange={onMaxPriceChange}
          testId="catalog-max-price"
          prefix="$"
          inputMode="decimal"
        />
      </div>
    </CatalogCollapsibleFilter>
  );
}
