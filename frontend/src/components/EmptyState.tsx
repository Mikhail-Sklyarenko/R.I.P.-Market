import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  message?: string;
  action?: ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="card empty-state" data-testid="empty-state">
      <h3 className="empty-state-title">{title}</h3>
      {message ? <p className="empty-state-message">{message}</p> : null}
      {action}
    </div>
  );
}
