import { useId, useState } from 'react';
import { rarityLabel, useLocale } from '../i18n';
import {
  CATALOG_RARITY_FILTER_VALUES,
  getRarityStyle,
} from '../utils/rarity-colors';
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
  const { locale, t } = useLocale();

  return (
    <CatalogCollapsibleFilter
      title={t('catalog.rarity')}
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
          {t('catalog.all')}
        </button>
        {CATALOG_RARITY_FILTER_VALUES.map((rarityValue) => {
          const style = getRarityStyle(rarityValue);
          return (
            <button
              key={rarityValue}
              type="button"
              className={`catalog-rarity-filter${value === rarityValue ? ' active' : ''}`}
              data-testid={`catalog-rarity-${rarityValue.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => onChange(rarityValue)}
            >
              <span
                className="catalog-rarity-dot"
                style={{ backgroundColor: style.color, boxShadow: `0 0 8px ${style.glow}` }}
                aria-hidden="true"
              />
              {rarityLabel(rarityValue, locale)}
            </button>
          );
        })}
      </div>
    </CatalogCollapsibleFilter>
  );
}
