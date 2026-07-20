import { useMemo, useState } from 'react';
import { parseWearFloat } from '../utils/wear-bar';
import { CatalogCollapsibleFilter } from './CatalogCollapsibleFilter';
import { CatalogRangeFieldCell } from './CatalogRangeFieldCell';

const FLOAT_BOUND_MIN = 0;
const FLOAT_BOUND_MAX = 1;
const FLOAT_STEP = 0.001;

type CatalogFloatRangeFilterProps = {
  floatMin: string;
  floatMax: string;
  onFloatMinChange: (value: string) => void;
  onFloatMaxChange: (value: string) => void;
  defaultOpen?: boolean;
};

function clampFloat(value: number): number {
  return Math.min(FLOAT_BOUND_MAX, Math.max(FLOAT_BOUND_MIN, value));
}

function formatFloatInput(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '') || '0';
}

function resolveSliderValues(floatMin: string, floatMax: string) {
  const parsedMin = parseWearFloat(floatMin);
  const parsedMax = parseWearFloat(floatMax);
  const minValue = parsedMin ?? FLOAT_BOUND_MIN;
  const maxValue = parsedMax ?? FLOAT_BOUND_MAX;

  return {
    minValue: Math.min(minValue, maxValue),
    maxValue: Math.max(minValue, maxValue),
  };
}

export function CatalogFloatRangeFilter({
  floatMin,
  floatMax,
  onFloatMinChange,
  onFloatMaxChange,
  defaultOpen = false,
}: CatalogFloatRangeFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { minValue, maxValue } = useMemo(
    () => resolveSliderValues(floatMin, floatMax),
    [floatMin, floatMax],
  );

  const hasActiveFilter = Boolean(floatMin.trim() || floatMax.trim());
  const minPercent = minValue * 100;
  const maxPercent = maxValue * 100;

  function handleMinSliderChange(nextMin: number) {
    const clampedMin = clampFloat(nextMin);
    const nextMax = Math.max(clampedMin, maxValue);
    onFloatMinChange(formatFloatInput(clampedMin));
    onFloatMaxChange(formatFloatInput(nextMax));
  }

  function handleMaxSliderChange(nextMax: number) {
    const clampedMax = clampFloat(nextMax);
    const nextMin = Math.min(minValue, clampedMax);
    onFloatMaxChange(formatFloatInput(clampedMax));
    onFloatMinChange(formatFloatInput(nextMin));
  }

  function handleReset() {
    onFloatMinChange('');
    onFloatMaxChange('');
  }

  return (
    <CatalogCollapsibleFilter
      title="Флоат"
      open={open}
      onToggle={() => setOpen((current) => !current)}
      onReset={handleReset}
      showReset={hasActiveFilter}
      testId="catalog-float-filter"
    >
      <div className="catalog-float-filter-body">
        <div
          className="catalog-float-slider"
          data-testid="catalog-float-slider"
        >
          <div className="catalog-float-slider-track" aria-hidden="true" />
          <div
            className="catalog-float-slider-fill"
            style={{
              left: `${minPercent}%`,
              width: `${Math.max(0, maxPercent - minPercent)}%`,
            }}
            aria-hidden="true"
          />
          <input
            type="range"
            className="catalog-float-slider-input catalog-float-slider-input-min"
            min={FLOAT_BOUND_MIN}
            max={FLOAT_BOUND_MAX}
            step={FLOAT_STEP}
            value={minValue}
            aria-label="Флоат от"
            data-testid="catalog-float-slider-min"
            onChange={(event) => handleMinSliderChange(Number(event.target.value))}
          />
          <input
            type="range"
            className="catalog-float-slider-input catalog-float-slider-input-max"
            min={FLOAT_BOUND_MIN}
            max={FLOAT_BOUND_MAX}
            step={FLOAT_STEP}
            value={maxValue}
            aria-label="Флоат до"
            data-testid="catalog-float-slider-max"
            onChange={(event) => handleMaxSliderChange(Number(event.target.value))}
          />
        </div>

        <div className="catalog-range-field-row catalog-float-range-row">
          <CatalogRangeFieldCell
            label="Флоат от"
            value={floatMin}
            onChange={onFloatMinChange}
            testId="catalog-float-min"
            inputMode="decimal"
          />
          <div className="catalog-range-field-divider" aria-hidden="true" />
          <CatalogRangeFieldCell
            label="Флоат до"
            value={floatMax}
            onChange={onFloatMaxChange}
            testId="catalog-float-max"
            inputMode="decimal"
          />
        </div>
      </div>
    </CatalogCollapsibleFilter>
  );
}
