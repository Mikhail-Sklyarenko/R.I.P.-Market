import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
};

export function PageHeader({ title, subtitle, actions, eyebrow }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="page-header-title">{title}</h2>
        {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
