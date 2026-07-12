import { useId } from 'react';

type CatalogRangeFieldCellProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  prefix?: string;
  inputMode?: 'decimal' | 'text';
};

export function CatalogRangeFieldCell({
  label,
  value,
  onChange,
  testId,
  prefix,
  inputMode = 'text',
}: CatalogRangeFieldCellProps) {
  const inputId = useId();
  const hasValue = value.trim().length > 0;

  return (
    <label
      htmlFor={inputId}
      className={`catalog-range-field-cell${hasValue ? ' has-value' : ''}`}
    >
      <span className="catalog-range-field-label">{label}</span>
      <span className="catalog-range-field-input-row">
        {prefix ? (
          <span className="catalog-range-field-prefix" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          id={inputId}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          className="catalog-range-field-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
        />
      </span>
    </label>
  );
}
