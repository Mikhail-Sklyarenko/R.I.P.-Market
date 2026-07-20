import { useId, useState } from 'react';
import {
  CATALOG_WEAR_FILTERS,
  getWearFilterTestId,
} from '../utils/wear-filters';
import { CatalogCollapsibleFilter } from './CatalogCollapsibleFilter';

type CatalogWearFilterProps = {
  value: string;
  onChange: (value: string) => void;
  defaultOpen?: boolean;
};

export function CatalogWearFilter({
  value,
  onChange,
  defaultOpen = false,
}: CatalogWearFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const groupId = useId();

  return (
    <CatalogCollapsibleFilter
      title="Износ"
      open={open}
      onToggle={() => setOpen((current) => !current)}
      onReset={() => onChange('')}
      showReset={Boolean(value)}
      testId="catalog-wear-filter"
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
          data-testid="catalog-wear-all"
          onClick={() => onChange('')}
        >
          Все
        </button>
        {CATALOG_WEAR_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`catalog-rarity-filter${value === option.value ? ' active' : ''}`}
            data-testid={getWearFilterTestId(option.value)}
            onClick={() => onChange(option.value)}
          >
            <span
              className="catalog-rarity-dot"
              style={{ backgroundColor: option.color, boxShadow: `0 0 8px ${option.color}88` }}
              aria-hidden="true"
            />
            {option.label}
          </button>
        ))}
      </div>
    </CatalogCollapsibleFilter>
  );
}
