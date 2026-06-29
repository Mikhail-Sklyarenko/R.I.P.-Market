import type { ReactNode } from 'react';

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <p className="field-error">{error}</p> : null}
    </label>
  );
}
