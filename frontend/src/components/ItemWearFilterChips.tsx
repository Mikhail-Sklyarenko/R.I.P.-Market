import { useLocale, wearLabel } from '../i18n';
import { CATALOG_WEAR_FILTERS } from '../utils/wear-filters';

type ItemWearFilterChipsProps = {
  value: string;
  availableWears: string[];
  onChange: (value: string) => void;
  testId?: string;
};

export function ItemWearFilterChips({
  value,
  availableWears,
  onChange,
  testId = 'item-page-wear-filters',
}: ItemWearFilterChipsProps) {
  const { locale, t } = useLocale();

  const options = CATALOG_WEAR_FILTERS.filter((option) =>
    availableWears.includes(option.value),
  );

  if (options.length <= 1) {
    return null;
  }

  return (
    <div className="item-page-wear-filters" data-testid={testId}>
      <div className="catalog-filter-chip-panel item-page-wear-filter-chips" role="group">
        <button
          type="button"
          className={`catalog-rarity-filter${value === '' ? ' active' : ''}`}
          data-testid="item-wear-all"
          onClick={() => onChange('')}
        >
          {t('catalog.all')}
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`catalog-rarity-filter${value === option.value ? ' active' : ''}`}
            data-testid={`item-wear-${option.value.toLowerCase()}`}
            onClick={() => onChange(option.value)}
          >
            <span
              className="catalog-rarity-dot"
              style={{ backgroundColor: option.color, boxShadow: `0 0 8px ${option.color}88` }}
              aria-hidden="true"
            />
            {wearLabel(option.value, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}
