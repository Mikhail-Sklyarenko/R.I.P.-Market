import { useId, useState } from 'react';
import type { SkinTraitCheckboxState } from '../utils/catalog-skin-trait-filters';
import { hasActiveSkinTraitFilters } from '../utils/catalog-skin-trait-filters';
import { CatalogCheckboxOption } from './CatalogCheckboxOption';
import { CatalogCollapsibleFilter } from './CatalogCollapsibleFilter';

type CatalogSkinTraitsFilterProps = {
  value: SkinTraitCheckboxState;
  onChange: (value: SkinTraitCheckboxState) => void;
  defaultOpen?: boolean;
};

export function CatalogSkinTraitsFilter({
  value,
  onChange,
  defaultOpen = false,
}: CatalogSkinTraitsFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const groupId = useId();

  function patch(next: Partial<SkinTraitCheckboxState>) {
    onChange({ ...value, ...next });
  }

  return (
    <CatalogCollapsibleFilter
      title="Особенности"
      open={open}
      onToggle={() => setOpen((current) => !current)}
      onReset={() =>
        onChange({
          includeStatTrak: false,
          excludeStatTrak: false,
          includeSouvenir: false,
          excludeSouvenir: false,
        })
      }
      showReset={hasActiveSkinTraitFilters(value)}
      testId="catalog-skin-traits-filter"
    >
      <div className="catalog-checkbox-list" role="group" aria-labelledby={groupId} id={groupId}>
        <CatalogCheckboxOption
          id={`${groupId}-stattrak-include`}
          label="StatTrak™"
          checked={value.includeStatTrak}
          onChange={(checked) => patch({ includeStatTrak: checked })}
          testId="catalog-trait-stattrak-only"
          accentClassName="catalog-checkbox-stattrak"
        />
        <CatalogCheckboxOption
          id={`${groupId}-stattrak-exclude`}
          label="Без StatTrak™"
          checked={value.excludeStatTrak}
          onChange={(checked) => patch({ excludeStatTrak: checked })}
          testId="catalog-trait-stattrak-exclude"
        />
        <CatalogCheckboxOption
          id={`${groupId}-souvenir-include`}
          label="Сувенирные"
          checked={value.includeSouvenir}
          onChange={(checked) => patch({ includeSouvenir: checked })}
          testId="catalog-trait-souvenir-only"
          accentClassName="catalog-checkbox-souvenir"
        />
        <CatalogCheckboxOption
          id={`${groupId}-souvenir-exclude`}
          label="Не сувенирные"
          checked={value.excludeSouvenir}
          onChange={(checked) => patch({ excludeSouvenir: checked })}
          testId="catalog-trait-souvenir-exclude"
        />
      </div>
    </CatalogCollapsibleFilter>
  );
}
