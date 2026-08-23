import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  message?: string;
  steps?: readonly string[];
  action?: ReactNode;
  secondaryAction?: ReactNode;
};

export function EmptyState({
  title,
  message,
  steps,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="card empty-state" data-testid="empty-state">
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
