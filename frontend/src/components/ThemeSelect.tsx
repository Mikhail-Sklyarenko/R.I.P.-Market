import { useEffect, useId, useRef, useState } from 'react';

export type ThemeSelectOption = {
  value: string;
  label: string;
};

type ThemeSelectProps = {
  value: string;
  options: readonly ThemeSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  'data-testid'?: string;
  onChange: (value: string) => void;
};

/**
 * Dark-theme select that replaces native OS option menus (which stay light-gray).
 */
export function ThemeSelect({
  value,
  options,
  placeholder = 'Выберите…',
  required = false,
  disabled = false,
  'data-testid': testId,
  onChange,
}: ThemeSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      className={`theme-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
      ref={rootRef}
      data-testid={testId}
    >
      {/* Keep a native control for HTML form required validation. */}
      <select
        className="theme-select-native"
        value={value}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="theme-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={`theme-select-value${selected ? '' : ' is-placeholder'}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <span className="theme-select-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul
          id={listboxId}
          className="theme-select-menu"
          role="listbox"
          data-testid={testId ? `${testId}-menu` : undefined}
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`theme-select-option${isActive ? ' is-active' : ''}`}
                  data-testid={
                    testId ? `${testId}-option-${option.value}` : undefined
                  }
                  onClick={() => choose(option.value)}
                >
                  <span>{option.label}</span>
                  {isActive ? (
                    <span className="theme-select-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
