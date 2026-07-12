import { useId, useState } from 'react';

type CatalogPriceRangeFilterProps = {
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  defaultOpen?: boolean;
};

function PriceRangeCell({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const inputId = useId();
  const hasValue = value.trim().length > 0;

  return (
    <label
      htmlFor={inputId}
      className={`catalog-price-range-cell${hasValue ? ' has-value' : ''}`}
    >
      <span className="catalog-price-range-label">{label}</span>
      <span className="catalog-price-range-input-row">
        <span className="catalog-price-range-prefix" aria-hidden="true">
          $
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="catalog-price-range-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
        />
      </span>
    </label>
  );
}

export function CatalogPriceRangeFilter({
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  defaultOpen = true,
}: CatalogPriceRangeFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="catalog-price-filter" data-testid="catalog-price-filter">
      <button
        type="button"
        className="catalog-price-filter-header"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="catalog-price-filter-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        <span>Цена</span>
        <span className="catalog-price-filter-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="catalog-price-filter-panel" id={panelId}>
          <div className="catalog-price-range-row">
            <PriceRangeCell
              label="Цена от"
              value={minPrice}
              onChange={onMinPriceChange}
              testId="catalog-min-price"
            />
            <div className="catalog-price-range-divider" aria-hidden="true" />
            <PriceRangeCell
              label="Цена до"
              value={maxPrice}
              onChange={onMaxPriceChange}
              testId="catalog-max-price"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
