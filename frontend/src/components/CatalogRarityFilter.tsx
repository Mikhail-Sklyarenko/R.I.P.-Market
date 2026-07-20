import { useId, useState } from 'react';
import { CATALOG_RARITY_FILTERS, getRarityStyle } from '../utils/rarity-colors';
import { CatalogCollapsibleFilter } from './CatalogCollapsibleFilter';

type CatalogRarityFilterProps = {
  value: string;
  onChange: (value: string) => void;
  defaultOpen?: boolean;
};

export function CatalogRarityFilter({
  value,
  onChange,
  defaultOpen = false,
}: CatalogRarityFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const groupId = useId();

  return (
    <CatalogCollapsibleFilter
      title="Редкость"
      open={open}
      onToggle={() => setOpen((current) => !current)}
      onReset={() => onChange('')}
      showReset={Boolean(value)}
      testId="catalog-rarity-filter"
    >
      <div
        className="catalog-filter-chip-panel"
        role="group"
        aria-labelledby={groupId}
        id={groupId}
      >
        <button
          type="button"
          className={`catalog-rarity-filter${value === '' ? ' active' : ''}`}
          data-testid="catalog-rarity-all"
          onClick={() => onChange('')}
        >
          Все
        </button>
        {CATALOG_RARITY_FILTERS.map((option) => {
          const style = getRarityStyle(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`catalog-rarity-filter${value === option.value ? ' active' : ''}`}
              data-testid={`catalog-rarity-${option.value.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => onChange(option.value)}
            >
              <span
                className="catalog-rarity-dot"
                style={{ backgroundColor: style.color, boxShadow: `0 0 8px ${style.glow}` }}
                aria-hidden="true"
              />
              {option.label}
            </button>
          );
        })}
      </div>
    </CatalogCollapsibleFilter>
  );
}
