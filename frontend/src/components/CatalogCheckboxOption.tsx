type CatalogCheckboxOptionProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
  accentClassName?: string;
};

export function CatalogCheckboxOption({
  id,
  label,
  checked,
  onChange,
  testId,
  accentClassName = '',
}: CatalogCheckboxOptionProps) {
  return (
    <label
      className={`catalog-checkbox-option${checked ? ' is-checked' : ''}${accentClassName ? ` ${accentClassName}` : ''}`}
      htmlFor={id}
      data-testid={testId}
    >
      <input
        id={id}
        type="checkbox"
        className="catalog-checkbox-option-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="catalog-checkbox-option-box" aria-hidden="true" />
      <span className="catalog-checkbox-option-label">{label}</span>
    </label>
  );
}
