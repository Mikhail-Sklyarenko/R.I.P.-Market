import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  message?: string;
  steps?: readonly string[];
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Filtered-empty vs truly-empty — same layout, softer tone. */
  variant?: 'default' | 'filtered';
  testId?: string;
};

export function EmptyState({
  title,
  message,
  steps,
  action,
  secondaryAction,
  variant = 'default',
  testId = 'empty-state',
}: EmptyStateProps) {
  return (
    <div
      className={`card empty-state${variant === 'filtered' ? ' is-filtered' : ''}`}
      data-testid={testId}
    >
      <h3 className="empty-state-title">{title}</h3>
      {message ? <p className="empty-state-message">{message}</p> : null}
      {steps && steps.length > 0 ? (
        <ol className="empty-state-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {action || secondaryAction ? (
        <div className="empty-state-actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
